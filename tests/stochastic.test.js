'use strict';

const { calcStochastic } = require('../backend/analysis/stochastic');

function makeCandles(count, { basePrice = 100, priceStep = 1, baseVol = 1000 } = {}) {
  const candles = [];
  for (let i = 0; i < count; i++) {
    const price = basePrice + i * priceStep;
    candles.push({
      time: Date.now() + i * 900_000,
      open:  price - 0.5,
      high:  price + 2,
      low:   price - 2,
      close: price,
      volume: baseVol,
    });
  }
  return candles;
}

describe('calcStochastic', () => {
  test('returns INSUFFICIENT_DATA with null input', () => {
    const result = calcStochastic(null);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.kLine).toBeNull();
    expect(result.dLine).toBeNull();
  });

  test('returns INSUFFICIENT_DATA with too few candles', () => {
    const candles = makeCandles(5);
    const result = calcStochastic(candles);
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('computes %K and %D with sufficient candles', () => {
    const candles = makeCandles(30, { priceStep: 1 });
    const result = calcStochastic(candles);
    expect(result.kLine).not.toBeNull();
    expect(result.dLine).not.toBeNull();
    expect(typeof result.kLine).toBe('number');
    expect(typeof result.dLine).toBe('number');
    expect(result.kLine).toBeGreaterThanOrEqual(0);
    expect(result.kLine).toBeLessThanOrEqual(100);
  });

  test('detects OVERBOUGHT in rising market', () => {
    // Steadily rising prices push %K toward 100
    const candles = makeCandles(30, { priceStep: 3 });
    const result = calcStochastic(candles);
    expect(result.kLine).toBeGreaterThan(70);
    expect(['OVERBOUGHT', 'BEARISH_CROSS', 'NEUTRAL']).toContain(result.label);
  });

  test('detects OVERSOLD in falling market', () => {
    // Steadily falling prices push %K toward 0
    const candles = makeCandles(30, { basePrice: 200, priceStep: -3 });
    const result = calcStochastic(candles);
    expect(result.kLine).toBeLessThan(30);
    expect(['OVERSOLD', 'BULLISH_CROSS', 'NEUTRAL']).toContain(result.label);
  });

  test('crossover detection fields are booleans', () => {
    const candles = makeCandles(30);
    const result = calcStochastic(candles);
    expect(typeof result.bullishCross).toBe('boolean');
    expect(typeof result.bearishCross).toBe('boolean');
  });

  test('custom period parameters work', () => {
    const candles = makeCandles(40);
    const result = calcStochastic(candles, { period: 9, signalPeriod: 3 });
    expect(result.kLine).not.toBeNull();
  });
});
