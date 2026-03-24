'use strict';

const { calcATR } = require('../backend/analysis/atr');
const { wilderSmooth, trueRange } = require('../backend/utils/math');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build candles with controllable volatility. */
function makeCandles(count, opts = {}) {
  const { basePrice = 100, trend = 'up', volatility = 2 } = opts;
  const candles = [];
  for (let i = 0; i < count; i++) {
    let price;
    if (trend === 'up')        price = basePrice + i * volatility;
    else if (trend === 'down') price = basePrice - i * volatility;
    else                        price = basePrice + Math.sin(i * 0.5) * volatility;
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

/** Build highly volatile candles — big H-L range relative to price. */
function makeVolatileCandles(count) {
  const candles = [];
  for (let i = 0; i < count; i++) {
    const base = 1.0 + Math.sin(i * 0.3) * 0.1;  // oscillate around $1.00
    candles.push({
      time: Date.now() + i * 900_000,
      open:  base,
      high:  base + 0.15,   // 15% range on a $1 token
      low:   base - 0.15,
      close: base + 0.02,
      volume: 5000,
    });
  }
  return candles;
}

/** Build calm candles — tiny H-L range. */
function makeCalmCandles(count) {
  const candles = [];
  for (let i = 0; i < count; i++) {
    const base = 100 + i * 0.01;
    candles.push({
      time: Date.now() + i * 900_000,
      open:  base,
      high:  base + 0.05,
      low:   base - 0.05,
      close: base + 0.01,
      volume: 1000,
    });
  }
  return candles;
}

// ── wilderSmooth tests ───────────────────────────────────────────────────────

describe('wilderSmooth', () => {
  test('returns empty array when input shorter than period', () => {
    expect(wilderSmooth([1, 2, 3], 5)).toEqual([]);
  });

  test('first value is sum of first period elements', () => {
    const arr = [2, 4, 6, 8, 10];
    const result = wilderSmooth(arr, 3);
    expect(result[0]).toBe(12); // 2 + 4 + 6
  });

  test('subsequent values use Wilder formula: sum - sum/period + next', () => {
    const arr = [2, 4, 6, 8, 10];
    const result = wilderSmooth(arr, 3);
    // result[0] = 12
    // result[1] = 12 - 12/3 + 8 = 12 - 4 + 8 = 16
    // result[2] = 16 - 16/3 + 10 = 16 - 5.333 + 10 = 20.667
    expect(result[1]).toBeCloseTo(16, 5);
    expect(result[2]).toBeCloseTo(20.6667, 3);
  });

  test('output length = input length - period + 1', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = wilderSmooth(arr, 4);
    expect(result.length).toBe(7); // 10 - 4 + 1
  });
});

// ── trueRange tests ──────────────────────────────────────────────────────────

describe('trueRange', () => {
  test('returns array of length candles.length - 1', () => {
    const candles = makeCandles(10);
    const tr = trueRange(candles);
    expect(tr.length).toBe(9);
  });

  test('TR = H-L when no gap', () => {
    const candles = [
      { time: 1, open: 10, high: 12, low: 8, close: 11, volume: 100 },
      { time: 2, open: 11, high: 13, low: 9, close: 12, volume: 100 },
    ];
    const tr = trueRange(candles);
    // H-L = 4, |H-prevC| = |13-11| = 2, |L-prevC| = |9-11| = 2 → max = 4
    expect(tr[0]).toBe(4);
  });

  test('TR uses |H-prevC| when gap up', () => {
    const candles = [
      { time: 1, open: 10, high: 10, low: 10, close: 10, volume: 100 },
      { time: 2, open: 20, high: 22, low: 19, close: 21, volume: 100 },
    ];
    const tr = trueRange(candles);
    // H-L = 3, |H-prevC| = |22-10| = 12, |L-prevC| = |19-10| = 9 → max = 12
    expect(tr[0]).toBe(12);
  });

  test('TR uses |L-prevC| when gap down', () => {
    const candles = [
      { time: 1, open: 100, high: 100, low: 100, close: 100, volume: 100 },
      { time: 2, open: 80, high: 82, low: 78, close: 79, volume: 100 },
    ];
    const tr = trueRange(candles);
    // H-L = 4, |H-prevC| = |82-100| = 18, |L-prevC| = |78-100| = 22 → max = 22
    expect(tr[0]).toBe(22);
  });
});

// ── calcATR tests ────────────────────────────────────────────────────────────

describe('calcATR', () => {
  test('returns INSUFFICIENT_DATA with null input', () => {
    const result = calcATR(null);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.value).toBeNull();
    expect(result.pct).toBeNull();
  });

  test('returns INSUFFICIENT_DATA with empty array', () => {
    const result = calcATR([]);
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('returns INSUFFICIENT_DATA with too few candles', () => {
    const candles = makeCandles(10); // need 15 for period=14
    const result = calcATR(candles, 14);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.value).toBeNull();
  });

  test('returns valid result with exactly minCandles (period+1)', () => {
    const candles = makeCandles(15, { trend: 'up' }); // 14+1 = 15
    const result = calcATR(candles, 14);
    expect(result.value).not.toBeNull();
    expect(typeof result.value).toBe('number');
    expect(result.pct).not.toBeNull();
    expect(typeof result.pct).toBe('number');
    expect(['HIGH_VOL', 'NORMAL', 'LOW_VOL']).toContain(result.label);
  });

  test('returns valid result with many candles', () => {
    const candles = makeCandles(50, { trend: 'up' });
    const result = calcATR(candles, 14);
    expect(result.value).not.toBeNull();
    expect(result.value).toBeGreaterThan(0);
    expect(result.pct).toBeGreaterThan(0);
  });

  test('pct = value / last close price', () => {
    const candles = makeCandles(30, { trend: 'up', volatility: 3 });
    const result = calcATR(candles, 14);
    const lastClose = candles[candles.length - 1].close;
    // pct is rounded to 4 decimal places, so allow small tolerance
    expect(result.pct).toBeCloseTo(result.value / lastClose, 3);
  });

  test('HIGH_VOL label when ATR% > 8%', () => {
    // Volatile candles on a low-price token = high ATR%
    const candles = makeVolatileCandles(30);
    const result = calcATR(candles, 14);
    expect(result.pct).toBeGreaterThan(0.08);
    expect(result.label).toBe('HIGH_VOL');
  });

  test('LOW_VOL label when ATR% < 3%', () => {
    const candles = makeCalmCandles(30);
    const result = calcATR(candles, 14);
    expect(result.pct).toBeLessThan(0.03);
    expect(result.label).toBe('LOW_VOL');
  });

  test('NORMAL label in between', () => {
    // Moderate volatility candles
    const candles = [];
    for (let i = 0; i < 30; i++) {
      const base = 10 + i * 0.1;
      candles.push({
        time: Date.now() + i * 900_000,
        open: base,
        high: base + 0.4,   // ~4% range on $10
        low:  base - 0.4,
        close: base + 0.05,
        volume: 1000,
      });
    }
    const result = calcATR(candles, 14);
    expect(result.pct).toBeGreaterThanOrEqual(0.03);
    expect(result.pct).toBeLessThanOrEqual(0.08);
    expect(result.label).toBe('NORMAL');
  });

  test('flat candles produce near-zero ATR → LOW_VOL', () => {
    const candles = [];
    for (let i = 0; i < 30; i++) {
      candles.push({
        time: Date.now() + i * 900_000,
        open: 100, high: 100, low: 100, close: 100, volume: 1000,
      });
    }
    const result = calcATR(candles, 14);
    expect(result.value).toBe(0);
    expect(result.pct).toBe(0);
    expect(result.label).toBe('LOW_VOL');
  });

  test('single large gap bar dominates ATR', () => {
    // Normal candles + one giant gap
    const candles = [];
    for (let i = 0; i < 25; i++) {
      const base = 100;
      candles.push({
        time: Date.now() + i * 900_000,
        open: base, high: base + 0.5, low: base - 0.5, close: base, volume: 1000,
      });
    }
    // Insert a huge gap candle near the end
    candles.push({
      time: Date.now() + 25 * 900_000,
      open: 120, high: 125, low: 115, close: 120, volume: 5000,
    });
    // A few more normal candles after
    for (let i = 26; i < 30; i++) {
      candles.push({
        time: Date.now() + i * 900_000,
        open: 120, high: 120.5, low: 119.5, close: 120, volume: 1000,
      });
    }
    const result = calcATR(candles, 14);
    // ATR should be elevated compared to the calm-only case
    expect(result.value).toBeGreaterThan(0.5);
  });

  test('respects custom period', () => {
    const candles = makeCandles(10, { trend: 'up' }); // 5+1 = 6, have 10
    const result = calcATR(candles, 5);
    expect(result.value).not.toBeNull();
    expect(typeof result.value).toBe('number');
  });

  test('value uses high precision for micro-prices', () => {
    // Meme coin at $0.0001 — ATR needs precision
    const candles = [];
    for (let i = 0; i < 20; i++) {
      const base = 0.0001 + i * 0.000001;
      candles.push({
        time: Date.now() + i * 900_000,
        open: base,
        high: base + 0.000005,
        low:  base - 0.000005,
        close: base + 0.000001,
        volume: 1000000,
      });
    }
    const result = calcATR(candles, 5);
    expect(result.value).not.toBeNull();
    expect(result.value).toBeGreaterThan(0);
    // Should not be rounded to 0
    expect(result.value).toBeLessThan(0.001);
  });

  test('ATR matches manual calculation for known data', () => {
    // 5 candles, period=3 — manually verify
    const candles = [
      { time: 1, open: 10, high: 12, low: 8,  close: 11, volume: 100 },
      { time: 2, open: 11, high: 14, low: 9,  close: 13, volume: 100 },
      { time: 3, open: 13, high: 15, low: 10, close: 12, volume: 100 },
      { time: 4, open: 12, high: 16, low: 11, close: 14, volume: 100 },
      { time: 5, open: 14, high: 17, low: 12, close: 15, volume: 100 },
    ];
    // TR values (bar 1-4):
    // bar1: max(14-9, |14-11|, |9-11|) = max(5, 3, 2) = 5
    // bar2: max(15-10, |15-13|, |10-13|) = max(5, 2, 3) = 5
    // bar3: max(16-11, |16-12|, |11-12|) = max(5, 4, 1) = 5
    // bar4: max(17-12, |17-14|, |12-14|) = max(5, 3, 2) = 5
    // All TR = 5

    // wilderSmooth([5, 5, 5, 5], 3):
    //   first = 5+5+5 = 15
    //   next = 15 - 15/3 + 5 = 15 - 5 + 5 = 15
    // ATR = 15 / 3 = 5

    const result = calcATR(candles, 3);
    expect(result.value).toBe(5);
    expect(result.pct).toBeCloseTo(5 / 15, 4); // 5 / lastClose(15) ≈ 0.3333
    expect(result.label).toBe('HIGH_VOL');      // 33% > 8%
  });
});
