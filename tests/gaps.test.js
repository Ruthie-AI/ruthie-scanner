'use strict';

const { detectGaps } = require('../backend/analysis/gaps');

describe('detectGaps', () => {
  test('returns empty with insufficient data', () => {
    expect(detectGaps(null).gaps).toEqual([]);
    expect(detectGaps([]).gaps).toEqual([]);
  });

  test('detects gap up', () => {
    const candles = Array(10).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    // Gap up at candle 5
    candles[5] = { time: 5, open: 105, high: 110, low: 104, close: 108, volume: 1000 };
    const result = detectGaps(candles);
    const gapUp = result.gaps.find(g => g.direction === 'up');
    expect(gapUp).toBeTruthy();
    expect(gapUp.gapSize).toBeGreaterThan(0.01);
  });

  test('detects gap down', () => {
    const candles = Array(10).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    candles[5] = { time: 5, open: 90, high: 92, low: 88, close: 91, volume: 1000 };
    const result = detectGaps(candles);
    const gapDown = result.gaps.find(g => g.direction === 'down');
    expect(gapDown).toBeTruthy();
  });

  test('ignores gaps smaller than 1%', () => {
    const candles = Array(10).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    // Tiny gap
    candles[5] = { time: 5, open: 100.5, high: 105, low: 95, close: 100, volume: 1000 };
    const result = detectGaps(candles);
    expect(result.gaps.length).toBe(0);
  });

  test('detects filled gaps', () => {
    const candles = Array(10).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    // Gap up at 5
    candles[5] = { time: 5, open: 110, high: 115, low: 109, close: 112, volume: 1000 };
    // Gap fills at 7
    candles[7] = { time: 7, open: 105, high: 106, low: 98, close: 99, volume: 1000 };
    const result = detectGaps(candles);
    const gap = result.gaps.find(g => g.index === 5);
    expect(gap).toBeTruthy();
    expect(gap.filled).toBe(true);
  });

  test('recentGap is within last 3 candles', () => {
    const candles = Array(10).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    // Gap at last candle
    candles[9] = { time: 9, open: 112, high: 115, low: 111, close: 113, volume: 1000 };
    const result = detectGaps(candles);
    expect(result.recentGap).toBeTruthy();
    expect(result.recentGap.index).toBe(9);
  });

  test('classifies gap types', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 102, low: 98, close: 100, volume: 1000,
    }));
    // Consolidation → breakaway gap
    candles[15] = { time: 15, open: 108, high: 112, low: 107, close: 110, volume: 2000 };
    const result = detectGaps(candles);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(['breakaway', 'runaway', 'exhaustion']).toContain(result.gaps[0].type);
  });
});
