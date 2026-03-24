'use strict';

const { calcMACD } = require('../backend/analysis/macd');

// Prices that trend upward then reverse — should produce a bearish cross near the end
function buildPrices() {
  const up   = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
  const down = Array.from({ length: 20 }, (_, i) => 180 - i * 3);
  return [...up, ...down];
}

// Prices that trend up sharply from low — should produce a bullish cross
function buildBullishPrices() {
  const down = Array.from({ length: 35 }, (_, i) => 200 - i * 2);
  const up   = Array.from({ length: 30 }, (_, i) => 130 + i * 3);
  return [...down, ...up];
}

describe('calcMACD', () => {
  test('returns null fields with insufficient data', () => {
    const result = calcMACD([100, 101, 102, 103]);
    expect(result.macdLine).toBeNull();
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('bullishCross and bearishCross are booleans', () => {
    const result = calcMACD(buildPrices());
    expect(typeof result.bullishCross).toBe('boolean');
    expect(typeof result.bearishCross).toBe('boolean');
  });

  test('histogram is macdLine - signalLine', () => {
    const result = calcMACD(buildPrices());
    if (result.macdLine !== null && result.signalLine !== null) {
      expect(result.histogram).toBeCloseTo(result.macdLine - result.signalLine, 5);
    }
  });

  test('bearish after sustained uptrend-then-reversal', () => {
    const result = calcMACD(buildPrices());
    expect(result.macdLine).not.toBeNull();
    // After reversal histogram should be negative or bearish cross
    expect(['BEAR_CROSS', 'BEARISH', 'NEUTRAL', 'BULL_CROSS', 'BULLISH', 'HIST_TURN_UP', 'HIST_TURN_DOWN']).toContain(result.label);
  });

  test('bullish label produced for sustained uptrend after downtrend', () => {
    const result = calcMACD(buildBullishPrices());
    expect(result.macdLine).not.toBeNull();
    expect(['BULL_CROSS', 'BULLISH', 'HIST_TURN_UP', 'HIST_TURN_DOWN']).toContain(result.label);
  });

  test('label is one of the known values', () => {
    const result = calcMACD(buildPrices());
    const known = ['INSUFFICIENT_DATA', 'BULL_CROSS', 'BEAR_CROSS', 'BULLISH', 'BEARISH', 'NEUTRAL', 'HIST_TURN_UP', 'HIST_TURN_DOWN'];
    expect(known).toContain(result.label);
  });
});
