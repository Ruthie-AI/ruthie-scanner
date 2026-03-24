'use strict';

const { calcIchimoku } = require('../backend/analysis/ichimoku');

function makeCandles(count, { basePrice = 100, priceStep = 0 } = {}) {
  const candles = [];
  for (let i = 0; i < count; i++) {
    const price = basePrice + i * priceStep;
    candles.push({
      time: Date.now() + i * 900_000,
      open:  price - 0.5,
      high:  price + 2,
      low:   price - 2,
      close: price,
      volume: 1000,
    });
  }
  return candles;
}

describe('calcIchimoku', () => {
  test('returns INSUFFICIENT_DATA with null input', () => {
    const result = calcIchimoku(null);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.conversionLine).toBeNull();
  });

  test('returns INSUFFICIENT_DATA with too few candles', () => {
    const candles = makeCandles(20);
    const result = calcIchimoku(candles);
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('computes all Ichimoku components with 52+ candles', () => {
    const candles = makeCandles(60, { priceStep: 1 });
    const result = calcIchimoku(candles);
    expect(result.conversionLine).not.toBeNull();
    expect(result.baseLine).not.toBeNull();
    expect(result.leadingA).not.toBeNull();
    expect(result.leadingB).not.toBeNull();
    expect(result.cloudColor).not.toBeNull();
    expect(result.priceVsCloud).not.toBeNull();
    expect(typeof result.conversionLine).toBe('number');
    expect(typeof result.baseLine).toBe('number');
  });

  test('bullish signal when price above green cloud', () => {
    // Steadily rising prices: price > cloud, cloud is green
    const candles = makeCandles(60, { basePrice: 50, priceStep: 2 });
    const result = calcIchimoku(candles);
    expect(result.cloudColor).toBe('green');
    expect(result.priceVsCloud).toBe('above');
    expect(result.label).toBe('BULLISH_SIGNAL');
  });

  test('bearish signal when price below red cloud', () => {
    // Steadily falling prices: price < cloud, cloud is red
    const candles = makeCandles(60, { basePrice: 200, priceStep: -2 });
    const result = calcIchimoku(candles);
    expect(result.cloudColor).toBe('red');
    expect(result.priceVsCloud).toBe('below');
    expect(result.label).toBe('BEARISH_SIGNAL');
  });

  test('neutral when price inside cloud', () => {
    // Flat price: price should be near/inside the cloud
    const candles = makeCandles(60, { basePrice: 100, priceStep: 0 });
    const result = calcIchimoku(candles);
    // With zero price step, conversion ≈ base ≈ leading lines
    expect(result.label).toBe('NEUTRAL');
  });

  test('custom periods work', () => {
    const candles = makeCandles(30, { priceStep: 1 });
    const result = calcIchimoku(candles, {
      conversionPeriod: 5, basePeriod: 13, leadingPeriod: 26,
    });
    expect(result.conversionLine).not.toBeNull();
  });

  test('crossover detection fields are booleans', () => {
    const candles = makeCandles(60, { priceStep: 1 });
    const result = calcIchimoku(candles);
    expect(typeof result.tkBullishCross).toBe('boolean');
    expect(typeof result.tkBearishCross).toBe('boolean');
  });
});
