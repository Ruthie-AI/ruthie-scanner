'use strict';

const { detectSideways } = require('../backend/analysis/sideways');

describe('detectSideways', () => {
  test('returns defaults with insufficient data', () => {
    const result = detectSideways(null, null, null, null);
    expect(result.isSideways).toBe(false);
    expect(result.regime).toBe('trending');
  });

  test('returns defaults with too few candles', () => {
    const candles = Array(5).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    const result = detectSideways(candles, null, null, null);
    expect(result.regime).toBe('trending');
  });

  test('detects sideways market with tight range', () => {
    // 20 candles with < 8% range
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 103, low: 97, close: 100 + (i % 2 === 0 ? 1 : -1), volume: 1000,
    }));
    const result = detectSideways(candles, null, null, null);
    expect(result.isSideways).toBe(true);
    expect(result.regime).toBe('sideways');
    expect(result.rangeWidth).toBeLessThan(0.08);
  });

  test('detects trending market with wide range', () => {
    // Trending up — wide range
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100 + i * 2, high: 105 + i * 2, low: 95 + i * 2, close: 100 + i * 2, volume: 1000,
    }));
    const result = detectSideways(candles, null, null, null);
    expect(result.regime).toBe('trending');
    expect(result.isSideways).toBe(false);
  });

  test('ADX confirms sideways when value < 20', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 103, low: 97, close: 100, volume: 1000,
    }));
    const adx = { value: 15, label: 'RANGING' };
    const result = detectSideways(candles, null, adx, null);
    expect(result.adxConfirm).toBe(true);
    expect(result.regime).toBe('sideways');
  });

  test('Bollinger squeeze supports sideways classification', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 101, low: 99, close: 100, volume: 1000,
    }));
    const adx = { value: 18, label: 'RANGING' };
    const bb = { squeeze: true, bandwidth: 0.04 };
    const result = detectSideways(candles, null, adx, bb);
    expect(result.regime).toBe('sideways');
  });

  test('detects choppy market with many direction changes', () => {
    // Wide range but lots of swing reversals
    const candles = Array(25).fill(null).map((_, i) => ({
      time: i, open: 100, high: 120, low: 80, close: 100 + (i % 2 === 0 ? 10 : -10), volume: 1000,
    }));
    // 6+ direction changes
    const swingPoints = {
      swingHighs: [
        { price: 110, index: 7, time: 7 },
        { price: 112, index: 11, time: 11 },
        { price: 108, index: 15, time: 15 },
        { price: 111, index: 19, time: 19 },
      ],
      swingLows: [
        { price: 90, index: 9, time: 9 },
        { price: 88, index: 13, time: 13 },
        { price: 91, index: 17, time: 17 },
      ],
    };
    const result = detectSideways(candles, swingPoints, null, null);
    expect(result.regime).toBe('choppy');
  });

  test('rangeWidth is calculated correctly', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 104, low: 96, close: 100, volume: 1000,
    }));
    const result = detectSideways(candles, null, null, null);
    expect(result.rangeWidth).toBeCloseTo(0.08, 2);
    expect(result.rangeDuration).toBe(20);
  });
});
