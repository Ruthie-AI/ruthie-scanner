'use strict';

const { calcFibonacci } = require('../backend/analysis/fibonacci');

function makeCandle(price, time = Date.now()) {
  return { time, open: price, high: price * 1.01, low: price * 0.99, close: price, volume: 1000 };
}

// Build candles that swing from high to low, ending at a Fibonacci level
function buildFibCandles() {
  const high = 1.00;
  const low  = 0.50;
  const range = high - low;

  // Price goes from high down, ends at 0.618 retracement = high - 0.618 * range
  const targetPrice = high - 0.618 * range;  // ≈ 0.691

  const candles = [];
  const steps   = 20;
  const now     = Date.now();

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    // Swing from high to low, then bounce to target
    let price;
    if (i < steps * 0.6) {
      price = high - (t / 0.6) * range;
    } else {
      price = low + ((t - 0.6) / 0.4) * (targetPrice - low);
    }
    candles.push({
      time:   now + i * 60_000,
      open:   price,
      high:   Math.max(price, price * 1.005),
      low:    Math.min(price, price * 0.995),
      close:  price,
      volume: 10_000,
    });
  }
  return candles;
}

describe('calcFibonacci', () => {
  test('returns INSUFFICIENT_DATA for empty input', () => {
    const result = calcFibonacci([]);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.swingHigh).toBeNull();
  });

  test('returns INSUFFICIENT_DATA for < 5 candles', () => {
    const candles = [makeCandle(1.0), makeCandle(0.9), makeCandle(0.8)];
    const result = calcFibonacci(candles);
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('correctly identifies swing high and low', () => {
    const candles = buildFibCandles();
    const result = calcFibonacci(candles);
    expect(result.swingHigh).toBeCloseTo(1.01, 1);  // high * 1.01
    expect(result.swingLow).toBeGreaterThan(0);
    expect(result.swingLow).toBeLessThan(result.swingHigh);
  });

  test('generates 5 fib levels', () => {
    const candles = buildFibCandles();
    const result = calcFibonacci(candles);
    expect(result.levels).toHaveLength(5);
    expect(result.levels.map(l => l.ratio)).toEqual([0.236, 0.382, 0.5, 0.618, 0.786]);
  });

  test('detects AT_KEY_LEVEL when price is at 0.618', () => {
    const candles = buildFibCandles();
    const result = calcFibonacci(candles);
    // The final price is within tolerance of 0.618
    expect(['AT_KEY_LEVEL', 'AT_FIB_LEVEL', 'NEAR_FIB']).toContain(result.label);
  });

  test('nearestLevel is a valid fib ratio', () => {
    const candles = buildFibCandles();
    const result = calcFibonacci(candles);
    const validRatios = [0.236, 0.382, 0.5, 0.618, 0.786];
    expect(validRatios).toContain(result.nearestLevel);
  });

  test('returns FLAT for flat price series', () => {
    const candles = Array.from({ length: 10 }, (_, i) =>
      ({ time: i * 1000, open: 1.0, high: 1.0, low: 1.0, close: 1.0, volume: 100 })
    );
    const result = calcFibonacci(candles);
    expect(result.label).toBe('FLAT');
  });
});
