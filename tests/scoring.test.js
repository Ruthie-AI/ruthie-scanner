'use strict';

const signals = require('../backend/scoring/signals');
const engine  = require('../backend/scoring/engine');

// ── Signal evaluators ──────────────────────────────────────────────────────────

describe('evalRSI', () => {
  test('returns null for null value', () => {
    expect(signals.evalRSI({ value: null, label: 'INSUFFICIENT_DATA' })).toBeNull();
  });

  test('returns score 100 for deeply oversold (RSI 20)', () => {
    const s = signals.evalRSI({ value: 20, label: 'OVERSOLD' });
    expect(s.score).toBe(100);
  });

  test('returns score 0-10 for overbought (RSI 80)', () => {
    const s = signals.evalRSI({ value: 80, label: 'OVERBOUGHT' });
    expect(s.score).toBeLessThanOrEqual(10);
  });

  test('score is between 0 and 100', () => {
    for (const rsiVal of [10, 30, 45, 60, 70, 85, 100]) {
      const s = signals.evalRSI({ value: rsiVal, label: 'NEUTRAL' });
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });
});

describe('evalMACD', () => {
  test('returns null for null macdLine', () => {
    expect(signals.evalMACD({ macdLine: null, label: 'INSUFFICIENT_DATA' })).toBeNull();
  });

  test('returns score 100 for bullish cross', () => {
    const s = signals.evalMACD({ macdLine: 0.001, signalLine: -0.001, bullishCross: true, bearishCross: false, label: 'BULL_CROSS' });
    expect(s.score).toBe(100);
  });

  test('returns score 5 for bearish cross', () => {
    const s = signals.evalMACD({ macdLine: -0.001, signalLine: 0.001, bullishCross: false, bearishCross: true, label: 'BEAR_CROSS' });
    expect(s.score).toBe(5);
  });
});

describe('evalMarketCap', () => {
  test('returns null for null marketCap', () => {
    expect(signals.evalMarketCap(null)).toBeNull();
  });

  test('returns 100 for sweet-spot market cap ($500K)', () => {
    const s = signals.evalMarketCap(500_000);
    expect(s.score).toBe(100);
  });

  test('returns lower score for very large market cap ($20M)', () => {
    const big = signals.evalMarketCap(20_000_000);
    const sweet = signals.evalMarketCap(500_000);
    expect(big.score).toBeLessThan(sweet.score);
  });

  test('score is clamped 0-100', () => {
    const s = signals.evalMarketCap(100_000_000);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
  });
});

describe('evalTokenAge', () => {
  test('returns null for null age', () => {
    expect(signals.evalTokenAge(null)).toBeNull();
  });

  test('returns 0 for sub-day token', () => {
    const s = signals.evalTokenAge(0.5);
    expect(s.score).toBe(0);
  });

  test('returns 100 for sweet-spot age (7 days)', () => {
    const s = signals.evalTokenAge(7);
    expect(s.score).toBe(100);
  });

  test('decays score for old tokens (45 days)', () => {
    const old  = signals.evalTokenAge(45);
    const sweet = signals.evalTokenAge(7);
    expect(old.score).toBeLessThan(sweet.score);
  });
});

// ── Composite engine ──────────────────────────────────────────────────────────

describe('engine.composite', () => {
  const baseToken = {
    rsi:           { value: 25, label: 'OVERSOLD' },
    macd:          { macdLine: 0.001, signalLine: -0.001, bullishCross: true, bearishCross: false, label: 'BULL_CROSS' },
    fibonacci:     { swingHigh: 1.0, swingLow: 0.5, levels: [], nearestLevel: 0.618, atFibLevel: true, atHighValueLevel: true, nearestDist: 0.005, label: 'AT_KEY_LEVEL' },
    trendingRank:  3,
    marketCap:     1_500_000,
    holderCount:   800,
    tokenAge:      6,
    twitterSignals: null,
  };

  test('produces compositeScore between 0 and 100', () => {
    const result = engine.composite(baseToken);
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
  });

  test('high-quality token gets BUY or STRONG_BUY', () => {
    const result = engine.composite(baseToken);
    expect(['BUY', 'STRONG_BUY']).toContain(result.category);
  });

  test('returns AVOID for empty token data', () => {
    const result = engine.composite({
      rsi: { value: null, label: 'INSUFFICIENT_DATA' },
      macd: { macdLine: null, label: 'INSUFFICIENT_DATA' },
      fibonacci: { swingHigh: null, label: 'INSUFFICIENT_DATA' },
      trendingRank: null,
      marketCap: null,
      holderCount: null,
      tokenAge: null,
      twitterSignals: null,
    });
    expect(result.category).toBe('AVOID');
    expect(result.compositeScore).toBe(0);
  });

  test('shouldAlert is true when score >= 75', () => {
    const result = engine.composite(baseToken);
    if (result.compositeScore >= 75) {
      expect(result.shouldAlert).toBe(true);
    }
  });

  test('signalBreakdown contains active signals with scores', () => {
    const result = engine.composite(baseToken);
    expect(result.signalBreakdown.length).toBeGreaterThan(0);
    for (const s of result.signalBreakdown) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });

  test('TA normalized weights sum to approximately 1 (Edge signals have weight 0)', () => {
    const result = engine.composite(baseToken);
    const taSignals = result.signalBreakdown.filter(s => !s.metadata);
    const edgeSignals = result.signalBreakdown.filter(s => s.metadata);
    const taTotal = taSignals.reduce((sum, s) => sum + s.normalizedWeight, 0);
    if (taSignals.length > 0) expect(taTotal).toBeCloseTo(1, 5);
    for (const e of edgeSignals) {
      expect(e.normalizedWeight).toBe(0);
    }
  });
});

// ── TA / Edge score split ─────────────────────────────────────────────────────

describe('TA / Edge score split', () => {
  // Token with both TA and Edge signals
  const fullToken = {
    rsi:           { value: 25, label: 'OVERSOLD' },
    macd:          { macdLine: 0.001, signalLine: -0.001, bullishCross: true, bearishCross: false, label: 'BULL_CROSS' },
    emaCross:      { fastEma: 1.1, slowEma: 1.0, bullishCross: true, bearishCross: false, label: 'EMA_CROSS_UP' },
    volumeTrend:   { priceSlope: 0.1, volumeSlope: 0.1, confirmed: true, label: 'VOL_CONFIRM_BULL' },
    fibonacci:     { swingHigh: 1.0, swingLow: 0.5, levels: [], nearestLevel: 0.618, atFibLevel: true, atHighValueLevel: true, nearestDist: 0.005, label: 'AT_KEY_LEVEL' },
    trendingRank:  3,
    marketCap:     500_000,
    holderCount:   1000,
    tokenAge:      7,
    twitterSignals: null,
  };

  // Token with ONLY Edge signals (no OHLCV)
  const edgeOnlyToken = {
    rsi:           { value: null, label: 'INSUFFICIENT_DATA' },
    macd:          { macdLine: null, label: 'INSUFFICIENT_DATA' },
    emaCross:      null,
    volumeTrend:   null,
    fibonacci:     { swingHigh: 1.0, swingLow: 0.5, levels: [], nearestLevel: 0.618, atFibLevel: true, atHighValueLevel: true, nearestDist: 0.005, label: 'AT_KEY_LEVEL' },
    trendingRank:  5,
    marketCap:     500_000,
    holderCount:   1000,
    tokenAge:      7,
    twitterSignals: null,
  };

  // Token with ONLY TA signals (not trending, no mcap, etc.)
  const taOnlyToken = {
    rsi:           { value: 25, label: 'OVERSOLD' },
    macd:          { macdLine: 0.001, signalLine: -0.001, bullishCross: true, bearishCross: false, label: 'BULL_CROSS' },
    emaCross:      { fastEma: 1.1, slowEma: 1.0, bullishCross: true, bearishCross: false, label: 'EMA_CROSS_UP' },
    volumeTrend:   { priceSlope: 0.1, volumeSlope: 0.1, confirmed: true, label: 'VOL_CONFIRM_BULL' },
    fibonacci:     { swingHigh: null, label: 'INSUFFICIENT_DATA' },
    trendingRank:  null,
    marketCap:     null,
    holderCount:   null,
    tokenAge:      null,
    twitterSignals: null,
  };

  test('returns taScore in result, no blendRatio or edgeScore', () => {
    const result = engine.composite(fullToken);
    expect(result).toHaveProperty('taScore');
    expect(result).not.toHaveProperty('edgeScore');
    expect(result).not.toHaveProperty('blendRatio');
    expect(typeof result.taScore).toBe('number');
  });

  test('taScore is null when no TA signals available', () => {
    const result = engine.composite(edgeOnlyToken);
    expect(result.taScore).toBeNull();
  });

  test('edgeScore is not returned (removed)', () => {
    const result = engine.composite(taOnlyToken);
    expect(result).not.toHaveProperty('edgeScore');
    expect(result.taScore).not.toBeNull();
  });

  test('compositeScore is 0 when only Edge signals available (pure TA)', () => {
    const result = engine.composite(edgeOnlyToken);
    expect(result.taScore).toBeNull();
    expect(result.compositeScore).toBe(0);
  });

  test('composite falls back to TA-only when edge signals absent', () => {
    const result = engine.composite(taOnlyToken);
    expect(result.compositeScore).toBe(result.taScore);
  });

  test('compositeScore equals taScore (pure TA, no blend)', () => {
    const result = engine.composite(fullToken);
    expect(result.compositeScore).toBe(result.taScore);
  });

  test('taScore is between 0 and 100', () => {
    const result = engine.composite(fullToken);
    expect(result.taScore).toBeGreaterThanOrEqual(0);
    expect(result.taScore).toBeLessThanOrEqual(100);
  });

  test('empty token returns null taScore and zero composite', () => {
    const result = engine.composite({
      rsi: { value: null, label: 'INSUFFICIENT_DATA' },
      macd: { macdLine: null, label: 'INSUFFICIENT_DATA' },
      fibonacci: { swingHigh: null, label: 'INSUFFICIENT_DATA' },
      trendingRank: null,
      marketCap: null,
      holderCount: null,
      tokenAge: null,
      twitterSignals: null,
    });
    expect(result.taScore).toBeNull();
    expect(result).not.toHaveProperty('edgeScore');
    expect(result.compositeScore).toBe(0);
  });
});

// ── Trend-context modulation ─────────────────────────────────────────────────

describe('trend-context modulation', () => {
  // Token with strong bullish trend-following signals (MACD bull cross + EMA cross up)
  const bullishToken = {
    rsi:           { value: 25, label: 'OVERSOLD' },
    macd:          { macdLine: 0.001, signalLine: -0.001, bullishCross: true, bearishCross: false, label: 'BULL_CROSS' },
    emaCross:      { fastEma: 1.1, slowEma: 1.0, bullishCross: true, bearishCross: false, label: 'EMA_CROSS_UP' },
    fibonacci:     { swingHigh: 1.0, swingLow: 0.5, levels: [], nearestLevel: 0.618, atFibLevel: true, atHighValueLevel: true, nearestDist: 0.005, label: 'AT_KEY_LEVEL' },
    volumeTrend:   { priceSlope: 0.1, volumeSlope: 0.1, confirmed: true, label: 'VOL_CONFIRM_BULL' },
    trendingRank:  5,
    marketCap:     500_000,
    holderCount:   1000,
    tokenAge:      7,
    twitterSignals: null,
  };

  test('downtrend reduces composite score vs no trend', () => {
    const noTrend = engine.composite({ ...bullishToken, swingPoints: null });
    const downTrend = engine.composite({
      ...bullishToken,
      swingPoints: { trend: 'DOWN', swingHighs: [], swingLows: [], higherHighs: false, higherLows: false, label: 'TREND_DOWN' },
    });
    expect(downTrend.compositeScore).toBeLessThan(noTrend.compositeScore);
  });

  test('sideways reduces composite score vs no trend', () => {
    const noTrend = engine.composite({ ...bullishToken, swingPoints: null });
    const sideways = engine.composite({
      ...bullishToken,
      swingPoints: { trend: 'SIDEWAYS', swingHighs: [], swingLows: [], higherHighs: true, higherLows: false, label: 'TREND_SIDEWAYS' },
    });
    expect(sideways.compositeScore).toBeLessThan(noTrend.compositeScore);
  });

  test('uptrend does NOT reduce composite score', () => {
    const noTrend = engine.composite({ ...bullishToken, swingPoints: null });
    const upTrend = engine.composite({
      ...bullishToken,
      swingPoints: { trend: 'UP', swingHighs: [], swingLows: [], higherHighs: true, higherLows: true, label: 'TREND_UP' },
    });
    expect(upTrend.compositeScore).toBe(noTrend.compositeScore);
  });

  test('downtrend penalty only applies to high-scoring EMA/MACD (>50)', () => {
    // Token with bearish MACD (score 5) and bearish EMA (score 20) — both below 50
    const bearishSignals = {
      ...bullishToken,
      macd:     { macdLine: -0.001, signalLine: 0.001, bullishCross: false, bearishCross: true, label: 'BEAR_CROSS' },
      emaCross: { fastEma: 0.9, slowEma: 1.0, bullishCross: false, bearishCross: false, label: 'EMA_BEARISH' },
    };
    const noTrend = engine.composite({ ...bearishSignals, swingPoints: null });
    const downTrend = engine.composite({
      ...bearishSignals,
      swingPoints: { trend: 'DOWN', swingHighs: [], swingLows: [], higherHighs: false, higherLows: false, label: 'TREND_DOWN' },
    });
    // No penalty — bearish signals in a downtrend are already correct
    expect(downTrend.compositeScore).toBe(noTrend.compositeScore);
  });

  test('sideways penalizes EMA/MACD regardless of score level', () => {
    // Token with bearish MACD (score 5) and bearish EMA (score 20) — below 50
    const bearishSignals = {
      ...bullishToken,
      macd:     { macdLine: -0.001, signalLine: 0.001, bullishCross: false, bearishCross: true, label: 'BEAR_CROSS' },
      emaCross: { fastEma: 0.9, slowEma: 1.0, bullishCross: false, bearishCross: false, label: 'EMA_BEARISH' },
    };
    const noTrend = engine.composite({ ...bearishSignals, swingPoints: null });
    const sideways = engine.composite({
      ...bearishSignals,
      swingPoints: { trend: 'SIDEWAYS', swingHighs: [], swingLows: [], higherHighs: true, higherLows: false, label: 'TREND_SIDEWAYS' },
    });
    // Sideways penalizes ALL EMA/MACD scores — even bearish ones are unreliable
    // Composite may round to same integer, so verify at signal level
    const ntMacd = noTrend.signalBreakdown.find(s => s.name === 'macd')?.score ?? 0;
    const swMacd = sideways.signalBreakdown.find(s => s.name === 'macd')?.score ?? 0;
    const ntEma  = noTrend.signalBreakdown.find(s => s.name === 'emaCross')?.score ?? 0;
    const swEma  = sideways.signalBreakdown.find(s => s.name === 'emaCross')?.score ?? 0;
    expect(swMacd).toBeLessThan(ntMacd);
    expect(swEma).toBeLessThan(ntEma);
  });
});

describe('categoryFromScore', () => {
  const { categoryFromScore } = engine;
  test('90+ = STRONG_BUY', ()  => expect(categoryFromScore(92)).toBe('STRONG_BUY'));
  test('75-89 = BUY',     ()  => expect(categoryFromScore(78)).toBe('BUY'));
  test('60-74 = WATCH',   ()  => expect(categoryFromScore(65)).toBe('WATCH'));
  test('40-59 = NEUTRAL', ()  => expect(categoryFromScore(50)).toBe('NEUTRAL'));
  test('<40 = AVOID',     ()  => expect(categoryFromScore(30)).toBe('AVOID'));
});
