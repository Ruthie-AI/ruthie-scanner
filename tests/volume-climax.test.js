'use strict';

const { detectClimax } = require('../backend/analysis/volume-climax');

describe('detectClimax', () => {
  test('returns defaults with insufficient data', () => {
    expect(detectClimax(null).isClimax).toBe(false);
    expect(detectClimax([]).isClimax).toBe(false);
  });

  test('no climax with normal volume', () => {
    const candles = Array(25).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 102, volume: 1000,
    }));
    const result = detectClimax(candles);
    expect(result.isClimax).toBe(false);
    expect(result.type).toBeNull();
  });

  test('detects buying climax at high with extreme volume', () => {
    const candles = Array(25).fill(null).map((_, i) => ({
      time: i, open: 100 + i * 0.5, high: 103 + i * 0.5, low: 97 + i * 0.5, close: 101 + i * 0.5, volume: 1000,
    }));
    // Last candle: big green at new high with extreme volume
    const lastIdx = candles.length - 1;
    candles[lastIdx] = {
      time: lastIdx, open: 112, high: 120, low: 111, close: 119, volume: 5000,
    };
    const result = detectClimax(candles);
    expect(result.isClimax).toBe(true);
    expect(result.type).toBe('buying');
    expect(result.intensity).toBeGreaterThanOrEqual(1);
  });

  test('detects selling climax at low with extreme volume', () => {
    const candles = Array(25).fill(null).map((_, i) => ({
      time: i, open: 120 - i * 0.5, high: 123 - i * 0.5, low: 117 - i * 0.5, close: 119 - i * 0.5, volume: 1000,
    }));
    const lastIdx = candles.length - 1;
    candles[lastIdx] = {
      time: lastIdx, open: 108, high: 109, low: 100, close: 101, volume: 5000,
    };
    const result = detectClimax(candles);
    expect(result.isClimax).toBe(true);
    expect(result.type).toBe('selling');
  });

  test('intensity scales with volume ratio', () => {
    const makeCandles = (vol) => {
      const c = Array(25).fill(null).map((_, i) => ({
        time: i, open: 100 + i * 0.5, high: 103 + i * 0.5, low: 97 + i * 0.5, close: 101 + i * 0.5, volume: 1000,
      }));
      c[c.length - 1] = { time: 24, open: 112, high: 120, low: 111, close: 119, volume: vol };
      return c;
    };
    const r3 = detectClimax(makeCandles(3500));
    const r8 = detectClimax(makeCandles(9000));
    expect(r8.intensity).toBeGreaterThanOrEqual(r3.intensity);
  });

  test('volumeRatio is always returned', () => {
    const candles = Array(25).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 102, volume: 1000,
    }));
    const result = detectClimax(candles);
    expect(result.volumeRatio).not.toBeNull();
    expect(typeof result.volumeRatio).toBe('number');
  });
});
