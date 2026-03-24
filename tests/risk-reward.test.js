'use strict';

const { calcRiskReward } = require('../backend/analysis/risk-reward');

describe('calcRiskReward', () => {
  test('returns nulls with insufficient data', () => {
    const result = calcRiskReward(null, 100, null, null);
    expect(result.rrRatio).toBeNull();
    expect(result.nearestSupport).toBeNull();
    expect(result.nearestResistance).toBeNull();
  });

  test('returns nulls with no entry price', () => {
    const candles = Array(10).fill(null).map((_, i) => ({ time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000 }));
    const result = calcRiskReward(candles, 0, null, null);
    expect(result.rrRatio).toBeNull();
  });

  test('calculates R:R from swing points', () => {
    const candles = Array(20).fill(null).map((_, i) => ({ time: i, open: 100, high: 110, low: 90, close: 100, volume: 1000 }));
    const swingPoints = {
      swingHighs: [{ price: 115, index: 15, time: 15 }],
      swingLows: [{ price: 90, index: 10, time: 10 }],
    };
    const result = calcRiskReward(candles, 100, swingPoints, null);
    expect(result.nearestSupport).toBe(90);
    expect(result.nearestResistance).toBe(115);
    expect(result.rrRatio).toBe(1.5); // reward=15, risk=10
    expect(result.riskPct).toBeCloseTo(0.10, 2);
    expect(result.rewardPct).toBeCloseTo(0.15, 2);
  });

  test('includes fibonacci levels in support/resistance', () => {
    const candles = Array(20).fill(null).map((_, i) => ({ time: i, open: 100, high: 110, low: 90, close: 100, volume: 1000 }));
    const fibonacci = {
      levels: [
        { ratio: 0.618, price: 97 },  // support (within 3%)
        { ratio: 0.382, price: 104 },  // resistance (within 5%)
      ],
    };
    const result = calcRiskReward(candles, 100, null, fibonacci);
    expect(result.nearestSupport).toBe(97);
    expect(result.nearestResistance).toBe(104);
    expect(result.rrRatio).toBeCloseTo(1.33, 1);
  });

  test('returns null rrRatio when only support found', () => {
    const candles = Array(20).fill(null).map((_, i) => ({ time: i, open: 100, high: 100, low: 90, close: 100, volume: 1000 }));
    const swingPoints = { swingHighs: [], swingLows: [{ price: 95, index: 10, time: 10 }] };
    const result = calcRiskReward(candles, 100, swingPoints, null);
    expect(result.nearestSupport).toBe(95);
    expect(result.nearestResistance).toBeNull();
    expect(result.rrRatio).toBeNull();
  });

  test('prefers strongest level when multiple exist', () => {
    const candles = Array(20).fill(null).map((_, i) => ({ time: i, open: 100, high: 110, low: 90, close: 100, volume: 1000 }));
    const swingPoints = {
      swingHighs: [{ price: 108, index: 15, time: 15 }],
      swingLows: [{ price: 95, index: 10, time: 10 }],
    };
    const fibonacci = {
      levels: [
        { ratio: 0.618, price: 97 },  // stronger fib support (strength 3)
        { ratio: 0.236, price: 103 }, // weaker fib resistance (strength 1)
      ],
    };
    const result = calcRiskReward(candles, 100, swingPoints, fibonacci);
    // Fib 0.618 at 97 has strength 3, swing low at 95 has strength 2 → fib wins
    expect(result.nearestSupport).toBe(97);
    // Swing high at 108 has strength 2, fib at 103 has strength 1 → swing wins
    expect(result.nearestResistance).toBe(108);
  });

  test('ignores swing points outside 40-candle window', () => {
    const candles = Array(50).fill(null).map((_, i) => ({ time: i, open: 100, high: 110, low: 90, close: 100, volume: 1000 }));
    const swingPoints = {
      swingHighs: [{ price: 120, index: 5, time: 5 }], // outside window (startIdx=10)
      swingLows: [{ price: 85, index: 3, time: 3 }],  // outside window
    };
    const result = calcRiskReward(candles, 100, swingPoints, null);
    expect(result.nearestSupport).toBeNull();
    expect(result.nearestResistance).toBeNull();
    expect(result.rrRatio).toBeNull();
  });

  test('handles edge case where support equals entry', () => {
    const candles = Array(20).fill(null).map((_, i) => ({ time: i, open: 100, high: 110, low: 100, close: 100, volume: 1000 }));
    const swingPoints = {
      swingHighs: [{ price: 110, index: 15, time: 15 }],
      swingLows: [{ price: 100, index: 10, time: 10 }], // same as entry
    };
    const result = calcRiskReward(candles, 100, swingPoints, null);
    // risk = 0, so rrRatio should be null
    expect(result.rrRatio).toBeNull();
  });
});
