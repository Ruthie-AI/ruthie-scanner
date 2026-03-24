'use strict';

const config   = require('../config');
const signals  = require('./signals');

const { STRONG_BUY, BUY, WATCH, NEUTRAL } = config.thresholds;

/**
 * Determine category label from composite score.
 * @param {number} score
 * @returns {string}
 */
function categoryFromScore(score) {
  if (score >= STRONG_BUY) return 'STRONG_BUY';
  if (score >= BUY)        return 'BUY';
  if (score >= WATCH)      return 'WATCH';
  if (score >= NEUTRAL)    return 'NEUTRAL';
  return 'AVOID';
}

/**
 * Compute composite score for a fully-enriched token.
 *
 * @param {object} tokenData  — merged TokenData from fetchers + analysis
 * @returns {{
 *   compositeScore: number,
 *   category: string,
 *   signalBreakdown: object[],
 *   shouldAlert: boolean
 * }}
 */
function composite(tokenData) {
  const {
    rsi, macd, fibonacci, emaCross, volumeTrend,
    trendingRank, firstTrendingAt, marketCap, holderCount, tokenAge, twitterSignals,
    swingPoints, divergence, adx, bollingerBands, obv, rsiFailureSwing,
    discoverySources,
  } = tokenData;

  // Evaluate each signal; null = signal excluded
  const rawSignals = [
    signals.evalRSI(rsi),
    signals.evalMACD(macd),
    signals.evalFibonacci(fibonacci),
    signals.evalEmaCross(emaCross),
    signals.evalTrending(trendingRank, firstTrendingAt),
    signals.evalMarketCap(marketCap),
    signals.evalHolderGrowth(holderCount),
    signals.evalTokenAge(tokenAge),
    signals.evalVolumeTrend(volumeTrend),
    signals.evalDivergence(divergence),
    signals.evalADX(adx),
    signals.evalBollingerBands(bollingerBands),
    signals.evalOBV(obv),
    signals.evalRsiFailureSwing(rsiFailureSwing),
    signals.evalDiscoveryConfluence(discoverySources),
    signals.evalTwitter(twitterSignals),
  ];

  // Apply weight overrides from config
  const weightOverrides = config.weights ?? {};
  const activeSignals = rawSignals
    .filter(Boolean)
    .map(s => ({
      ...s,
      weight: weightOverrides[s.name] ?? s.weight,
    }));

  // ── Trend-context modulation (Murphy Ch.4/8/10) ────────────────────────────
  // Swing point trend gates trend-following signals to prevent buying into
  // falling knives or whipsawing in sideways markets.
  //
  // When 1H HTF data is available, it takes precedence over 15m-only analysis.
  // Multiplier dampens score (NOT weight) so the signal still participates
  // in the composite but with reduced influence. Set to 1.0 to disable.
  const trend15m = swingPoints?.trend ?? null;
  const trend1h  = tokenData.htf?.swingPoints?.trend ?? null;
  const htfConf  = config.htf ?? {};

  if (trend15m || trend1h) {
    for (const s of activeSignals) {
      if (s.name !== 'emaCross' && s.name !== 'macd') continue;

      let mul = 1.0;  // no penalty by default

      if (trend1h === 'DOWN') {
        // 1H downtrend: strong penalty on bullish trend-following
        if (s.score > 50) mul = htfConf.conflictPenalty ?? 0.5;
      } else if (trend1h === 'SIDEWAYS') {
        mul = htfConf.sidewaysPenalty ?? 0.85;
      } else if (trend1h === 'UP' && trend15m === 'DOWN') {
        // 1H up but 15m dip — reduced penalty (dip in uptrend)
        if (s.score > 50) mul = 0.8;
      } else if (trend15m === 'DOWN' && !trend1h) {
        // No 1H data — fall back to 15m-only penalty
        if (s.score > 50) mul = config.trendContextPenalty ?? 0.6;
      } else if (trend15m === 'SIDEWAYS' && !trend1h) {
        mul = config.sidewaysTrendPenalty ?? 0.85;
      }
      // Both UP or 1H UP + 15m UP: mul stays 1.0 (no penalty)

      s.score = Math.round(s.score * mul);
    }
  }

  if (activeSignals.length === 0) {
    return {
      compositeScore: 0,
      taScore: null,
      category: 'AVOID',
      signalBreakdown: [],
      shouldAlert: false,
      taSignalCount: 0,
    };
  }

  // Count OHLCV-dependent TA signals that actually contributed.
  // Fibonacci is excluded — it works with 4 synthetic DexScreener candles (just needs
  // swing high/low) so it always passes. The gate must require real oscillator/momentum
  // signals (RSI, MACD, EMA, volumeTrend, divergence) that need 15-50 real OHLCV candles.
  const TA_SIGNALS = new Set(['rsi', 'macd', 'emaCross', 'volumeTrend', 'divergence', 'adx', 'bollingerBands', 'obv', 'rsiFailureSwing']);
  const EDGE_SIGNALS = new Set(['fibonacci', 'trending', 'marketCap', 'holderGrowth', 'tokenAge', 'discoveryConfluence', 'twitter']);
  const taSignalCount = activeSignals.filter(s => TA_SIGNALS.has(s.name)).length;

  // ── Re-normalize weights — TA signals only ────────────────────────────────
  // Edge signals are metadata: they still evaluate (labels stay in breakdown)
  // but get normalizedWeight=0 and metadata=true. Only TA signals participate
  // in the composite score.
  const taGroup   = activeSignals.filter(s => TA_SIGNALS.has(s.name));
  const edgeGroup = activeSignals.filter(s => EDGE_SIGNALS.has(s.name));

  const taTotalWeight = taGroup.reduce((sum, s) => sum + s.weight, 0);
  const normalized = [
    ...taGroup.map(s => ({
      ...s,
      normalizedWeight: taTotalWeight > 0 ? s.weight / taTotalWeight : 0,
    })),
    ...edgeGroup.map(s => ({
      ...s,
      normalizedWeight: 0,
      metadata: true,
    })),
  ];

  // ── TA sub-score ─────────────────────────────────────────────────────────
  // Re-normalizes weights internally. null when no TA signals contribute.
  const taScore = (() => {
    if (taGroup.length === 0) return null;
    const tw = taGroup.reduce((sum, s) => sum + s.weight, 0);
    if (tw === 0) return null;
    return Math.round(taGroup.reduce((sum, s) => sum + s.score * (s.weight / tw), 0));
  })();

  // compositeScore = pure TA. Edge signals are metadata — individual labels
  // in signalBreakdown are the useful part.
  const compositeScore = taScore ?? 0;

  const category = categoryFromScore(compositeScore);

  // Alert if BUY or STRONG_BUY
  const shouldAlert = compositeScore >= BUY;

  return {
    compositeScore,
    taScore,
    category,
    signalBreakdown: normalized,
    shouldAlert,
    taSignalCount,
  };
}

module.exports = { composite, categoryFromScore };
