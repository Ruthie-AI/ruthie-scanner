'use strict';

const { calcOBV } = require('../backend/analysis/obv');

/** Build simple candles with controllable price and volume trends. */
function makeCandles(count, { basePrice = 100, priceStep = 1, baseVol = 1000, volStep = 0 } = {}) {
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

describe('calcOBV', () => {
  test('returns INSUFFICIENT_DATA with null input', () => {
    const result = calcOBV(null);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.value).toBeNull();
    expect(result.slope).toBeNull();
  });

  test('returns INSUFFICIENT_DATA with 1 candle', () => {
    const candles = makeCandles(1);
    const result = calcOBV(candles);
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('returns NO_VOLUME_DATA when all volumes are zero', () => {
    const candles = makeCandles(10, { baseVol: 0, volStep: 0 });
    const result = calcOBV(candles);
    expect(result.label).toBe('NO_VOLUME_DATA');
    expect(result.value).toBeNull();
  });

  test('OBV increases with rising prices', () => {
    const candles = makeCandles(10, { priceStep: 2, baseVol: 1000 });
    const result = calcOBV(candles);

    expect(result.value).toBeGreaterThan(0);
    expect(result.label).toBe('OBV_CONFIRM_BULL');
  });

  test('OBV decreases with falling prices', () => {
    const candles = makeCandles(10, { priceStep: -2, baseVol: 1000 });
    const result = calcOBV(candles);

    expect(result.value).toBeLessThan(0);
    expect(result.label).toBe('OBV_CONFIRM_BEAR');
  });

  test('detects bullish divergence (OBV rising, price falling)', () => {
    // Price falling overall, but closes are up more often than down → OBV rises
    // Last 5 candles: price slopes down, OBV slopes up
    const candles = [
      { time: 0, open: 110, high: 111, low: 109, close: 110, volume: 1000 },
      { time: 1, open: 110, high: 111, low: 108, close: 109, volume: 500 },  // down, OBV -500
      { time: 2, open: 109, high: 110, low: 107, close: 110, volume: 2000 }, // up, OBV +2000
      { time: 3, open: 110, high: 111, low: 106, close: 107, volume: 300 },  // down, OBV -300
      { time: 4, open: 107, high: 109, low: 105, close: 108, volume: 3000 }, // up, OBV +3000
      { time: 5, open: 108, high: 109, low: 104, close: 105, volume: 200 },  // down, OBV -200
      { time: 6, open: 105, high: 107, low: 103, close: 106, volume: 4000 }, // up, OBV +4000
    ];
    // Price slope over last 5: 110→107→108→105→106 — falling
    // OBV slope over last 5: rising (big up volumes dwarf small down volumes)
    const result = calcOBV(candles);
    expect(result.priceDiverging).toBe(true);
    expect(result.label).toBe('OBV_BULL_DIVERGE');
  });

  test('detects bearish divergence (OBV falling, price rising)', () => {
    // Price rising overall, but closes are down more often → OBV falls
    const candles = [
      { time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { time: 1, open: 100, high: 102, low: 100, close: 101, volume: 200 },  // up, OBV +200
      { time: 2, open: 101, high: 102, low: 99, close: 100, volume: 3000 },  // down, OBV -3000
      { time: 3, open: 100, high: 103, low: 100, close: 102, volume: 300 },  // up, OBV +300
      { time: 4, open: 102, high: 103, low: 100, close: 101, volume: 4000 }, // down, OBV -4000
      { time: 5, open: 101, high: 104, low: 101, close: 103, volume: 100 },  // up, OBV +100
      { time: 6, open: 103, high: 105, low: 102, close: 102, volume: 5000 }, // down, OBV -5000
    ];
    // Price slope over last 5: 100→102→101→103→102 — rising overall
    // OBV slope over last 5: falling (big down volumes)
    const result = calcOBV(candles);
    expect(result.priceDiverging).toBe(true);
    expect(result.label).toBe('OBV_BEAR_DIVERGE');
  });

  test('OBV unchanged on equal closes', () => {
    const candles = Array(10).fill(null).map((_, i) => ({
      time: i,
      open: 99,
      high: 101,
      low: 99,
      close: 100,
      volume: 1000,
    }));
    const result = calcOBV(candles);
    expect(result.value).toBe(0);
    expect(result.label).toBe('OBV_FLAT');
  });

  test('running sum is correct', () => {
    // 3 candles: up, down, up
    const candles = [
      { time: 0, open: 99, high: 101, low: 99, close: 100, volume: 500 },
      { time: 1, open: 100, high: 102, low: 100, close: 102, volume: 300 }, // up → +300
      { time: 2, open: 102, high: 103, low: 99, close: 99, volume: 400 },   // down → -400
      { time: 3, open: 99, high: 101, low: 98, close: 101, volume: 200 },   // up → +200
      { time: 4, open: 101, high: 103, low: 100, close: 103, volume: 100 }, // up → +100
    ];
    const result = calcOBV(candles);
    // OBV: 0 + 300 - 400 + 200 + 100 = 200
    expect(result.value).toBe(200);
  });

  test('slope is computed and rounded', () => {
    const candles = makeCandles(10, { priceStep: 1, baseVol: 1000 });
    const result = calcOBV(candles);
    expect(typeof result.slope).toBe('number');
  });

  test('returns INSUFFICIENT_DATA when not enough for slope', () => {
    const candles = makeCandles(3, { baseVol: 1000 });
    const result = calcOBV(candles, 5);
    // Has 4 OBV values (from 3 candles + initial 0) but lookback is 5
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });
});
