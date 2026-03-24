'use strict';

const { calcSwingPoints } = require('../backend/analysis/swing-points');

const NOW = Date.now();

/** Build a candle at a given close price with configurable high/low spread */
function makeCandle(close, i, spread = 0.01) {
  return {
    time:   NOW + i * 900_000,  // 15m intervals
    open:   close,
    high:   close * (1 + spread),
    low:    close * (1 - spread),
    close,
    volume: 10_000,
  };
}

/**
 * Build a candle series with explicit highs and lows.
 * Each entry: { high, low } — close is midpoint.
 */
function fromPeaks(points) {
  return points.map((p, i) => ({
    time:   NOW + i * 900_000,
    open:   (p.high + p.low) / 2,
    high:   p.high,
    low:    p.low,
    close:  (p.high + p.low) / 2,
    volume: 10_000,
  }));
}

describe('calcSwingPoints', () => {
  test('returns INSUFFICIENT_DATA when < 7 candles (default lookback=3)', () => {
    const candles = Array.from({ length: 6 }, (_, i) => makeCandle(1.0, i));
    const result = calcSwingPoints(candles);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.swingHighs).toEqual([]);
    expect(result.swingLows).toEqual([]);
    expect(result.trend).toBeNull();
  });

  test('returns INSUFFICIENT_DATA for null input', () => {
    expect(calcSwingPoints(null).label).toBe('INSUFFICIENT_DATA');
    expect(calcSwingPoints([]).label).toBe('INSUFFICIENT_DATA');
  });

  test('detects a single swing high', () => {
    // V-shape: rise to peak at index 5, then fall
    const prices = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
    const candles = prices.map((p, i) => makeCandle(p, i, 0.001));
    const result = calcSwingPoints(candles);

    expect(result.swingHighs.length).toBeGreaterThanOrEqual(1);
    // The peak should be near index 5
    const peak = result.swingHighs.find(h => h.index === 5);
    expect(peak).toBeDefined();
  });

  test('detects a single swing low', () => {
    // Inverted V: fall to trough at index 5, then rise
    const prices = [6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6];
    const candles = prices.map((p, i) => makeCandle(p, i, 0.001));
    const result = calcSwingPoints(candles);

    expect(result.swingLows.length).toBeGreaterThanOrEqual(1);
    const trough = result.swingLows.find(l => l.index === 5);
    expect(trough).toBeDefined();
  });

  test('detects uptrend — higher highs and higher lows', () => {
    // Clear wave with distinct values — no adjacent duplicates
    // trough1≈1.0  peak1≈3.0  trough2≈1.8  peak2≈5.0  trough3≈3.2  peak3≈6.0
    const prices = [1.5, 1.2, 1.0, 1.3, 2.0, 3.0, 2.6, 2.2, 1.8, 2.1, 3.5, 5.0, 4.2, 3.6, 3.2, 3.8, 4.5, 6.0, 5.5, 5.0, 4.5];
    const candles = prices.map((p, i) => makeCandle(p, i, 0.001));
    const result = calcSwingPoints(candles);

    expect(result.trend).toBe('UP');
    expect(result.higherHighs).toBe(true);
    expect(result.higherLows).toBe(true);
    expect(result.label).toBe('TREND_UP');
  });

  test('detects downtrend — lower highs and lower lows', () => {
    // Clear downtrend wave — each peak and trough lower than the last
    // peak1≈6.0  trough1≈3.8  peak2≈5.0  trough2≈2.8  peak3≈4.0  trough3≈1.8
    const prices = [5.5, 5.8, 6.0, 5.5, 4.8, 3.8, 4.2, 4.6, 5.0, 4.5, 3.8, 2.8, 3.2, 3.6, 4.0, 3.5, 2.8, 1.8, 2.2, 2.6, 2.9];
    const candles = prices.map((p, i) => makeCandle(p, i, 0.001));
    const result = calcSwingPoints(candles);

    expect(result.trend).toBe('DOWN');
    expect(result.higherHighs).toBe(false);
    expect(result.higherLows).toBe(false);
    expect(result.label).toBe('TREND_DOWN');
  });

  test('detects sideways — mixed highs/lows', () => {
    // Higher highs but lower lows = conflicting signals = SIDEWAYS
    // peak1≈4  trough1≈1  peak2≈5  trough2≈0.5
    const prices = [3.0, 2.5, 1.5, 1.0, 1.5, 2.5, 3.5, 4.0, 3.5, 2.5, 1.5, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 4.5, 3.5, 2.5, 1.8];
    const candles = prices.map((p, i) => makeCandle(p, i, 0.001));
    const result = calcSwingPoints(candles);

    expect(result.trend).toBe('SIDEWAYS');
    expect(result.label).toBe('TREND_SIDEWAYS');
  });

  test('custom lookback=2 requires fewer candles', () => {
    // With lookback=2, min candles = 5
    const prices = [1, 2, 3, 2, 1];
    const candles = prices.map((p, i) => makeCandle(p, i, 0.001));
    const result = calcSwingPoints(candles, 2);

    expect(result.swingHighs.length).toBe(1);
    expect(result.swingHighs[0].index).toBe(2);
  });

  test('flat price produces no swings', () => {
    const candles = Array.from({ length: 15 }, (_, i) => makeCandle(1.0, i, 0));
    const result = calcSwingPoints(candles);

    expect(result.swingHighs).toEqual([]);
    expect(result.swingLows).toEqual([]);
    expect(result.trend).toBeNull();
  });

  test('swing points include correct time values', () => {
    const prices = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
    const candles = prices.map((p, i) => makeCandle(p, i, 0.001));
    const result = calcSwingPoints(candles);

    for (const sh of result.swingHighs) {
      expect(sh.time).toBe(candles[sh.index].time);
    }
    for (const sl of result.swingLows) {
      expect(sl.time).toBe(candles[sl.index].time);
    }
  });
});
