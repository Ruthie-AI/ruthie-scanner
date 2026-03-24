'use strict';

const { detectTranslation } = require('../backend/analysis/translation');

describe('detectTranslation', () => {
  test('returns defaults with insufficient data', () => {
    expect(detectTranslation(null, null).translation).toBeNull();
  });

  test('returns defaults without enough swing points', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    const sp = { swingHighs: [], swingLows: [{ price: 90, index: 5, time: 5 }] };
    const result = detectTranslation(candles, sp);
    expect(result.translation).toBeNull();
  });

  test('detects right translation (bullish)', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    const sp = {
      swingHighs: [{ price: 115, index: 14, time: 14 }], // peak in second half
      swingLows: [
        { price: 90, index: 4, time: 4 },    // cycle start
        { price: 92, index: 18, time: 18 },   // cycle end (midpoint=11)
      ],
    };
    const result = detectTranslation(candles, sp);
    expect(result.translation).toBe('right');
  });

  test('detects left translation (bearish)', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    const sp = {
      swingHighs: [{ price: 115, index: 6, time: 6 }], // peak in first half
      swingLows: [
        { price: 90, index: 4, time: 4 },
        { price: 92, index: 18, time: 18 },
      ],
    };
    const result = detectTranslation(candles, sp);
    expect(result.translation).toBe('left');
  });

  test('detects centered translation', () => {
    const candles = Array(20).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    const sp = {
      swingHighs: [{ price: 115, index: 11, time: 11 }], // peak near center
      swingLows: [
        { price: 90, index: 4, time: 4 },
        { price: 92, index: 18, time: 18 },
      ],
    };
    const result = detectTranslation(candles, sp);
    expect(result.translation).toBe('centered');
  });

  test('uses most recent complete cycle', () => {
    const candles = Array(30).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    const sp = {
      swingHighs: [
        { price: 110, index: 6, time: 6 },   // old cycle
        { price: 115, index: 24, time: 24 },  // recent cycle — right translation
      ],
      swingLows: [
        { price: 90, index: 3, time: 3 },
        { price: 88, index: 10, time: 10 },
        { price: 91, index: 17, time: 17 },
        { price: 89, index: 27, time: 27 },
      ],
    };
    const result = detectTranslation(candles, sp);
    expect(result.translation).toBe('right');
  });

  test('confidence reflects cycle quality', () => {
    const candles = Array(30).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    const sp = {
      swingHighs: [{ price: 120, index: 22, time: 22 }],
      swingLows: [
        { price: 90, index: 5, time: 5 },
        { price: 88, index: 25, time: 25 },
      ],
    };
    const result = detectTranslation(candles, sp);
    expect(result.confidence).toBeGreaterThan(40);
  });
});
