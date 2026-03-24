'use strict';

const { findLevels } = require('../backend/analysis/support-resistance');

describe('findLevels', () => {
  test('returns empty with insufficient data', () => {
    const result = findLevels(null, null);
    expect(result.supports).toEqual([]);
    expect(result.resistances).toEqual([]);
    expect(result.zones).toEqual([]);
  });

  test('returns empty with too few candles', () => {
    const candles = [{ time: 0, open: 1, high: 1.1, low: 0.9, close: 1, volume: 100 }];
    const result = findLevels(candles, null);
    expect(result.supports).toEqual([]);
  });

  test('finds support from swing lows below current price', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 110, low: 90, close: 100, volume: 1000,
    }));
    const swingPoints = {
      swingHighs: [{ price: 115, index: 10, time: 10 }],
      swingLows: [{ price: 88, index: 8, time: 8 }],
    };
    const result = findLevels(candles, swingPoints);
    expect(result.supports.length).toBeGreaterThanOrEqual(1);
    const swingSupport = result.supports.find(s => Math.abs(s.price - 88) < 2);
    expect(swingSupport).toBeTruthy();
  });

  test('finds resistance from swing highs above current price', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 110, low: 90, close: 100, volume: 1000,
    }));
    const swingPoints = {
      swingHighs: [{ price: 115, index: 10, time: 10 }],
      swingLows: [],
    };
    const result = findLevels(candles, swingPoints);
    expect(result.resistances.length).toBeGreaterThanOrEqual(1);
    const swingRes = result.resistances.find(r => Math.abs(r.price - 115) < 2);
    expect(swingRes).toBeTruthy();
  });

  test('detects volume-based levels', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    // Spike volume at candle 10
    candles[10] = { time: 10, open: 100, high: 105, low: 95, close: 98, volume: 5000 };
    const result = findLevels(candles, null);
    // Should have volume-based level around 100
    expect(result.zones.length).toBeGreaterThanOrEqual(1);
  });

  test('returns at most 5 supports and 5 resistances', () => {
    const candles = Array(50).fill(null).map((_, i) => ({
      time: i, open: 100, high: 110, low: 90, close: 100, volume: 1000,
    }));
    const swingPoints = {
      swingHighs: Array(10).fill(null).map((_, i) => ({ price: 102 + i * 3, index: i * 4, time: i * 4 })),
      swingLows: Array(10).fill(null).map((_, i) => ({ price: 98 - i * 3, index: i * 4 + 2, time: i * 4 + 2 })),
    };
    const result = findLevels(candles, swingPoints);
    expect(result.supports.length).toBeLessThanOrEqual(5);
    expect(result.resistances.length).toBeLessThanOrEqual(5);
  });

  test('clusters nearby levels', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 110, low: 90, close: 100, volume: 1000,
    }));
    const swingPoints = {
      swingHighs: [],
      swingLows: [
        { price: 95.0, index: 5, time: 5 },
        { price: 95.5, index: 10, time: 10 },  // within 1.5% of 95
      ],
    };
    const result = findLevels(candles, swingPoints);
    // Should cluster into 1 support, not 2
    const closeSupports = result.supports.filter(s => s.price >= 94 && s.price <= 96);
    expect(closeSupports.length).toBe(1);
    expect(closeSupports[0].touches).toBe(2);
  });

  test('zones are sorted by price', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 110, low: 90, close: 100, volume: 1000,
    }));
    const swingPoints = {
      swingHighs: [{ price: 115, index: 10, time: 10 }],
      swingLows: [{ price: 85, index: 8, time: 8 }],
    };
    const result = findLevels(candles, swingPoints);
    for (let i = 1; i < result.zones.length; i++) {
      expect(result.zones[i].price).toBeGreaterThanOrEqual(result.zones[i - 1].price);
    }
  });

  test('strength reflects touches and recency', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 110, low: 90, close: 100, volume: 1000,
    }));
    const swingPoints = {
      swingHighs: [],
      swingLows: [
        { price: 92, index: 2, time: 2 },    // old
        { price: 92.5, index: 18, time: 18 }, // recent — should cluster with above
      ],
    };
    const result = findLevels(candles, swingPoints);
    const support = result.supports[0];
    expect(support).toBeTruthy();
    expect(support.strength).toBeGreaterThan(0);
  });
});
