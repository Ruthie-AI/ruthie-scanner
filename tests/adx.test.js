'use strict';

const { calcADX } = require('../backend/analysis/adx');

/** Build a simple set of candles with controllable values. */
function makeCandles(count, opts = {}) {
  const { basePrice = 100, trend = 'up', volatility = 2 } = opts;
  const candles = [];
  for (let i = 0; i < count; i++) {
    let price;
    if (trend === 'up') {
      price = basePrice + i * volatility;
    } else if (trend === 'down') {
      price = basePrice - i * volatility;
    } else {
      // sideways / ranging — oscillate
      price = basePrice + Math.sin(i * 0.5) * volatility;
    }
    candles.push({
      time: Date.now() + i * 900_000,
      open:  price - 0.5,
      high:  price + 1,
      low:   price - 1,
      close: price + 0.5,
      volume: 1000 + i * 10,
    });
  }
  return candles;
}

/** Build strongly trending candles — each bar makes a clear new high. */
function makeTrendingCandles(count, direction = 'up') {
  const candles = [];
  const step = 5;
  for (let i = 0; i < count; i++) {
    const base = direction === 'up' ? 100 + i * step : 100 + (count - i) * step;
    candles.push({
      time: Date.now() + i * 900_000,
      open:  base,
      high:  base + step * 0.8,
      low:   base - step * 0.2,
      close: base + step * 0.6,
      volume: 1000,
    });
  }
  return candles;
}

/** Build ranging candles — price oscillates in a tight range. */
function makeRangingCandles(count) {
  const candles = [];
  for (let i = 0; i < count; i++) {
    const base = 100 + Math.sin(i * 0.7) * 2;
    candles.push({
      time: Date.now() + i * 900_000,
      open:  base - 0.3,
      high:  base + 0.5,
      low:   base - 0.5,
      close: base + 0.3,
      volume: 1000,
    });
  }
  return candles;
}

describe('calcADX', () => {
  test('returns INSUFFICIENT_DATA with null input', () => {
    const result = calcADX(null);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.value).toBeNull();
    expect(result.plusDI).toBeNull();
    expect(result.minusDI).toBeNull();
    expect(result.rising).toBeNull();
  });

  test('returns INSUFFICIENT_DATA with too few candles', () => {
    const candles = makeCandles(10); // need 28 (14*2)
    const result = calcADX(candles, 14);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.value).toBeNull();
  });

  test('returns valid result with exactly minCandles', () => {
    const candles = makeCandles(28, { trend: 'up' }); // 14*2 = 28
    const result = calcADX(candles, 14);
    // Should have enough data to compute at least something
    expect(result.value).not.toBeNull();
    expect(typeof result.value).toBe('number');
    expect(typeof result.plusDI).toBe('number');
    expect(typeof result.minusDI).toBe('number');
    expect(['STRONG_TREND', 'TRENDING', 'WEAK_TREND', 'RANGING']).toContain(result.label);
  });

  test('detects trending market with strong directional candles', () => {
    const candles = makeTrendingCandles(50, 'up');
    const result = calcADX(candles, 14);
    expect(result.value).not.toBeNull();
    // Strong trend should have ADX ≥ 25
    expect(result.value).toBeGreaterThanOrEqual(25);
    expect(['STRONG_TREND', 'TRENDING']).toContain(result.label);
    // Uptrend: +DI should exceed -DI
    expect(result.plusDI).toBeGreaterThan(result.minusDI);
  });

  test('detects ranging market with oscillating candles', () => {
    const candles = makeRangingCandles(50);
    const result = calcADX(candles, 14);
    expect(result.value).not.toBeNull();
    // Ranging market should have low ADX
    expect(result.value).toBeLessThan(30);
    expect(['RANGING', 'WEAK_TREND']).toContain(result.label);
  });

  test('downtrend has -DI > +DI', () => {
    const candles = makeTrendingCandles(50, 'down');
    const result = calcADX(candles, 14);
    expect(result.value).not.toBeNull();
    // Downtrend: -DI should exceed +DI
    expect(result.minusDI).toBeGreaterThan(result.plusDI);
  });

  test('rising field reflects ADX direction', () => {
    const candles = makeTrendingCandles(50, 'up');
    const result = calcADX(candles, 14);
    expect(result.rising).not.toBeNull();
    expect(typeof result.rising).toBe('boolean');
  });

  test('respects custom period', () => {
    const candles = makeCandles(20, { trend: 'up' }); // 7*2 = 14, need 20 to be safe
    const result = calcADX(candles, 7);
    expect(result.value).not.toBeNull();
    expect(typeof result.value).toBe('number');
  });

  test('values are rounded to 2 decimal places', () => {
    const candles = makeTrendingCandles(50, 'up');
    const result = calcADX(candles, 14);
    // Check that values have at most 2 decimal places
    const decimals = (n) => {
      const s = String(n);
      const d = s.indexOf('.');
      return d === -1 ? 0 : s.length - d - 1;
    };
    expect(decimals(result.value)).toBeLessThanOrEqual(2);
    expect(decimals(result.plusDI)).toBeLessThanOrEqual(2);
    expect(decimals(result.minusDI)).toBeLessThanOrEqual(2);
  });

  test('handles flat candles without errors', () => {
    // All candles identical — TR=0, DM=0
    const candles = [];
    for (let i = 0; i < 50; i++) {
      candles.push({
        time: Date.now() + i * 900_000,
        open: 100, high: 100, low: 100, close: 100, volume: 1000,
      });
    }
    const result = calcADX(candles, 14);
    // Should not throw — value may be 0 or null but should be safe
    expect(result.label).toBeDefined();
  });
});
