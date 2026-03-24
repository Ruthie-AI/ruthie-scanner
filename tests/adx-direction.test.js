'use strict';

const { evalADX } = require('../backend/scoring/signals');

describe('ADX direction bonus', () => {
  test('bullish trending gets +10 bonus', () => {
    const result = evalADX({
      value: 30, plusDI: 30, minusDI: 15, rising: true, label: 'TRENDING',
    });
    // Base score for TRENDING rising = 75, +10 for bullish DI = 85
    expect(result.score).toBe(85);
  });

  test('bearish trending gets -10 penalty', () => {
    const result = evalADX({
      value: 30, plusDI: 15, minusDI: 30, rising: true, label: 'TRENDING',
    });
    // Base score for TRENDING rising = 75, -10 for bearish DI = 65
    expect(result.score).toBe(65);
  });

  test('bullish strong trend gets +10 bonus', () => {
    const result = evalADX({
      value: 45, plusDI: 35, minusDI: 10, rising: true, label: 'STRONG_TREND',
    });
    // Base = 95, +10 = clamped to 100
    expect(result.score).toBe(100);
  });

  test('bearish strong trend gets -10 penalty', () => {
    const result = evalADX({
      value: 45, plusDI: 10, minusDI: 35, rising: true, label: 'STRONG_TREND',
    });
    // Base = 95, -10 = 85
    expect(result.score).toBe(85);
  });

  test('no DI bonus for WEAK_TREND', () => {
    const result = evalADX({
      value: 22, plusDI: 30, minusDI: 15, rising: false, label: 'WEAK_TREND',
    });
    expect(result.score).toBe(40);
  });

  test('no DI bonus for RANGING', () => {
    const result = evalADX({
      value: 15, plusDI: 20, minusDI: 25, rising: false, label: 'RANGING',
    });
    expect(result.score).toBe(20);
  });

  test('handles null DI values gracefully', () => {
    const result = evalADX({
      value: 30, plusDI: null, minusDI: null, rising: true, label: 'TRENDING',
    });
    expect(result.score).toBe(75); // no bonus applied
  });

  test('equal DI values = no bonus (bullish check > 0 is false)', () => {
    const result = evalADX({
      value: 30, plusDI: 20, minusDI: 20, rising: true, label: 'TRENDING',
    });
    // diSpread = 0, > 0 is false → -10 penalty
    expect(result.score).toBe(65);
  });

  test('score is clamped to 0-100', () => {
    const result = evalADX({
      value: 15, plusDI: 10, minusDI: 30, rising: false, label: 'RANGING',
    });
    // RANGING = 20, no DI bonus for RANGING, stays at 20
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
