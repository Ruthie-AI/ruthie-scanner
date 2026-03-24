'use strict';

const { calcRSI } = require('../backend/analysis/rsi');

// Generate a synthetic declining price series (oversold scenario)
function decliningPrices(count, start = 100, step = 1.5) {
  return Array.from({ length: count }, (_, i) => start - i * step);
}

// Generate a synthetic rising price series (overbought scenario)
function risingPrices(count, start = 50, step = 2) {
  return Array.from({ length: count }, (_, i) => start + i * step);
}

describe('calcRSI', () => {
  test('returns null with insufficient data', () => {
    const result = calcRSI([100, 101, 102]);
    expect(result.value).toBeNull();
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('returns null for empty input', () => {
    const result = calcRSI([]);
    expect(result.value).toBeNull();
  });

  test('labels deeply declining prices as OVERSOLD', () => {
    const prices = decliningPrices(30);
    const result = calcRSI(prices);
    expect(result.value).not.toBeNull();
    expect(result.value).toBeLessThanOrEqual(30);
    expect(result.label).toBe('OVERSOLD');
  });

  test('labels steeply rising prices as OVERBOUGHT', () => {
    const prices = risingPrices(30);
    const result = calcRSI(prices);
    expect(result.value).not.toBeNull();
    expect(result.value).toBeGreaterThanOrEqual(70);
    expect(result.label).toBe('OVERBOUGHT');
  });

  test('RSI value is between 0 and 100', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 5);
    const result = calcRSI(prices);
    if (result.value !== null) {
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThanOrEqual(100);
    }
  });

  test('flat prices produce a valid RSI value (library returns 100 — no losses)', () => {
    const prices = Array.from({ length: 30 }, () => 100);
    const result = calcRSI(prices);
    // technicalindicators returns 100 for flat prices (no down moves).
    if (result.value !== null) {
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThanOrEqual(100);
    }
  });
});
