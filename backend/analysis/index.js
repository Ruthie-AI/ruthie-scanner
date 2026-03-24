'use strict';

const normalizer = require('./normalizer');
const { calcRSI }         = require('./rsi');
const { calcMACD }        = require('./macd');
const { calcFibonacci }   = require('./fibonacci');
const { calcEmaCross }    = require('./ema-cross');
const { calcVolumeTrend }  = require('./volume-trend');
const { calcSwingPoints }  = require('./swing-points');
const { calcDivergence }      = require('./divergence');
const { calcADX }             = require('./adx');
const { calcBollingerBands }  = require('./bollinger');
const { calcOBV }             = require('./obv');
const { calcRsiFailureSwing } = require('./rsi-failure-swing');
const { calcATR }             = require('./atr');
const { calcStochastic }      = require('./stochastic');
const { calcVWAP }            = require('./vwap');
const { calcIchimoku }        = require('./ichimoku');

// ── Murphy TA Phase 1-3 modules ──────────────────────────────────────────────
const { calcRiskReward }    = require('./risk-reward');
const { detectSideways }    = require('./sideways');
const { findLevels }        = require('./support-resistance');
const { detectPatterns }    = require('./chart-patterns');
const { calcSAR }           = require('./parabolic-sar');
const { detectClimax }      = require('./volume-climax');
const { detectGaps }        = require('./gaps');
const { detectTranslation } = require('./translation');

/**
 * Run all TA indicators on raw candle data.
 *
 * @param {object[]} rawCandles  — candles from any fetcher
 * @param {object}   [opts]      — optional: { entryPrice } for R:R calculation
 * @returns {object}
 */
function run(rawCandles, opts = {}) {
  const candles = normalizer.toOHLCV(rawCandles);
  const closes  = normalizer.closes(candles);

  const rsi             = calcRSI(closes);
  const macd            = calcMACD(closes);
  const swingPoints     = calcSwingPoints(candles);
  const divergence      = calcDivergence(swingPoints, rsi, macd, closes.length);
  const adx             = calcADX(candles);
  const bollingerBands  = calcBollingerBands(closes);
  const fibonacci       = calcFibonacci(candles);

  // Phase 1-3 — Murphy TA enhancements (all use existing candle data, zero CU)
  const supportResistance = findLevels(candles, swingPoints);
  const volumes           = candles.map(c => c.volume);
  const sideways          = detectSideways(candles, swingPoints, adx, bollingerBands);
  const chartPatterns     = detectPatterns(candles, swingPoints, supportResistance, volumes);
  const parabolicSar      = calcSAR(candles);
  const volumeClimax      = detectClimax(candles);
  const gaps              = detectGaps(candles);
  const translation       = detectTranslation(candles, swingPoints);
  const riskReward        = opts.entryPrice
    ? calcRiskReward(candles, opts.entryPrice, swingPoints, fibonacci)
    : null;

  return {
    candles,
    rsi,
    macd,
    fibonacci,
    emaCross:       calcEmaCross(closes),
    volumeTrend:    calcVolumeTrend(candles),
    swingPoints,
    divergence,
    adx,
    bollingerBands,
    obv:            calcOBV(candles),
    rsiFailureSwing: calcRsiFailureSwing(rsi),
    atr:            calcATR(candles),
    // New TA signals (ship at weight 0 — data collection)
    stochastic:       calcStochastic(candles),
    vwap:             calcVWAP(candles),
    ichimoku:         calcIchimoku(candles),
    // Murphy TA Phase 1-3
    supportResistance,
    sideways,
    chartPatterns,
    parabolicSar,
    volumeClimax,
    gaps,
    translation,
    riskReward,
  };
}

module.exports = { run };
