'use strict';

const { calcSAR } = require('../backend/analysis/parabolic-sar');

describe('calcSAR', () => {
  test('returns defaults with insufficient data', () => {
    expect(calcSAR(null).currentSar).toBeNull();
    expect(calcSAR([]).sar).toEqual([]);
    expect(calcSAR([{ open: 1, high: 2, low: 0.5, close: 1.5 }]).currentSar).toBeNull();
  });

  test('computes SAR for uptrend', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000,
    }));
    const result = calcSAR(candles);
    expect(result.trend).toBe('up');
    expect(result.currentSar).toBeLessThan(candles[candles.length - 1].close);
    expect(result.sar.length).toBe(20);
  });

  test('computes SAR for downtrend', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 120 - i, high: 122 - i, low: 119 - i, close: 121 - i, volume: 1000,
    }));
    const result = calcSAR(candles);
    expect(result.trend).toBe('down');
    expect(result.currentSar).toBeGreaterThan(candles[candles.length - 1].close);
  });

  test('detects trend flip', () => {
    // Uptrend then sharp reversal
    const candles = [];
    for (let i = 0; i < 10; i++) candles.push({ time: i, open: 100 + i * 2, high: 103 + i * 2, low: 99 + i * 2, close: 101 + i * 2, volume: 1000 });
    for (let i = 10; i < 20; i++) candles.push({ time: i, open: 120 - (i - 10) * 3, high: 121 - (i - 10) * 3, low: 118 - (i - 10) * 3, close: 119 - (i - 10) * 3, volume: 1000 });
    const result = calcSAR(candles);
    expect(result.trend).toBe('down');
  });

  test('respects custom AF parameters', () => {
    const candles = Array(15).fill(null).map((_, i) => ({
      time: i, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000,
    }));
    const fast = calcSAR(candles, 0.04, 0.40);
    const slow = calcSAR(candles, 0.01, 0.10);
    // Faster AF should have SAR closer to price
    expect(fast.currentSar).toBeGreaterThan(slow.currentSar);
  });

  test('SAR values are finite numbers', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100 + Math.sin(i) * 5, high: 103 + Math.sin(i) * 5, low: 97 + Math.sin(i) * 5,
      close: 100 + Math.sin(i) * 5, volume: 1000,
    }));
    const result = calcSAR(candles);
    for (const v of result.sar) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
