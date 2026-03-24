'use strict';

const { calcVWAP } = require('../backend/analysis/vwap');

function makeCandles(count, { basePrice = 100, priceStep = 0, baseVol = 1000, volStep = 0 } = {}) {
  const candles = [];
  for (let i = 0; i < count; i++) {
    const price = basePrice + i * priceStep;
    candles.push({
      time: Date.now() + i * 900_000,
      open:  price - 0.5,
      high:  price + 1,
      low:   price - 1,
      close: price,
      volume: baseVol + i * volStep,
    });
  }
  return candles;
}

describe('calcVWAP', () => {
  test('returns INSUFFICIENT_DATA with null input', () => {
    const result = calcVWAP(null);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.vwapPrice).toBeNull();
  });

  test('returns INSUFFICIENT_DATA with too few candles', () => {
    const candles = makeCandles(3);
    const result = calcVWAP(candles);
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('returns INSUFFICIENT_DATA with zero volume', () => {
    const candles = makeCandles(10, { baseVol: 0 });
    const result = calcVWAP(candles);
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('computes VWAP for flat price with uniform volume', () => {
    const candles = makeCandles(20, { basePrice: 100, priceStep: 0, baseVol: 1000 });
    const result = calcVWAP(candles);
    expect(result.vwapPrice).not.toBeNull();
    // Flat price → VWAP ≈ typical price ≈ 100
    expect(result.vwapPrice).toBeCloseTo(100, 0);
    expect(result.label).toBe('NEAR_VWAP');
  });

  test('price below VWAP labeled correctly', () => {
    // Rising then dropping — last close well below VWAP
    const candles = [];
    for (let i = 0; i < 20; i++) {
      const price = i < 15 ? 100 + i * 2 : 100 - (i - 15) * 5;
      candles.push({
        time: i, open: price - 0.5, high: price + 1,
        low: price - 1, close: price, volume: 1000,
      });
    }
    const result = calcVWAP(candles);
    expect(result.distance).toBeLessThan(0);
    expect(result.label).toBe('BELOW_VWAP');
  });

  test('price above VWAP labeled correctly', () => {
    // Last few candles surge above average
    const candles = [];
    for (let i = 0; i < 20; i++) {
      const price = i < 15 ? 100 : 100 + (i - 14) * 10;
      candles.push({
        time: i, open: price - 0.5, high: price + 1,
        low: price - 1, close: price, volume: 1000,
      });
    }
    const result = calcVWAP(candles);
    expect(result.distance).toBeGreaterThan(0);
    expect(result.label).toBe('ABOVE_VWAP');
  });

  test('bands are computed', () => {
    // Non-zero price step so there's actual variance for bands
    const candles = makeCandles(20, { basePrice: 100, baseVol: 1000, priceStep: 0.5 });
    const result = calcVWAP(candles);
    expect(result.bands.upper).not.toBeNull();
    expect(result.bands.lower).not.toBeNull();
    expect(result.bands.upper).toBeGreaterThan(result.bands.lower);
  });

  test('distance is a number with percentage', () => {
    const candles = makeCandles(20, { basePrice: 100, baseVol: 1000, priceStep: 1 });
    const result = calcVWAP(candles);
    expect(typeof result.distance).toBe('number');
  });

  test('custom period works', () => {
    const candles = makeCandles(30, { baseVol: 500 });
    const result = calcVWAP(candles, { period: 10 });
    expect(result.vwapPrice).not.toBeNull();
  });
});
