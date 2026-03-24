'use strict';

const { detectPatterns } = require('../backend/analysis/chart-patterns');

describe('detectPatterns', () => {
  test('returns empty patterns with insufficient data', () => {
    const result = detectPatterns(null, null, null);
    expect(result.patterns).toEqual([]);
  });

  test('returns empty with too few candles', () => {
    const candles = Array(5).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    const result = detectPatterns(candles, { swingHighs: [], swingLows: [] });
    expect(result.patterns).toEqual([]);
  });

  describe('Double Top', () => {
    test('detects confirmed double top', () => {
      const candles = Array(30).fill(null).map((_, i) => ({
        time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
      }));
      // Price breaks below neckline
      candles[candles.length - 1].close = 88;

      const sp = {
        swingHighs: [
          { price: 110, index: 5, time: 5 },
          { price: 111, index: 15, time: 15 }, // within 2% of first
        ],
        swingLows: [{ price: 92, index: 10, time: 10 }],
      };
      const result = detectPatterns(candles, sp);
      const dt = result.patterns.find(p => p.type === 'DOUBLE_TOP');
      expect(dt).toBeTruthy();
      expect(dt.direction).toBe('bearish');
      expect(dt.confidence).toBeGreaterThan(50);
    });

    test('detects forming double top', () => {
      const candles = Array(30).fill(null).map((_, i) => ({
        time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
      }));

      const sp = {
        swingHighs: [
          { price: 110, index: 5, time: 5 },
          { price: 111, index: 15, time: 15 },
        ],
        swingLows: [{ price: 92, index: 10, time: 10 }],
      };
      const result = detectPatterns(candles, sp);
      const dt = result.patterns.find(p => p.type === 'DOUBLE_TOP_FORMING');
      expect(dt).toBeTruthy();
    });
  });

  describe('Double Bottom', () => {
    test('detects confirmed double bottom', () => {
      const candles = Array(30).fill(null).map((_, i) => ({
        time: i, open: 100, high: 115, low: 95, close: 100, volume: 1000,
      }));
      candles[candles.length - 1].close = 120;

      const sp = {
        swingHighs: [{ price: 112, index: 10, time: 10 }],
        swingLows: [
          { price: 90, index: 5, time: 5 },
          { price: 91, index: 15, time: 15 },
        ],
      };
      const result = detectPatterns(candles, sp);
      const db = result.patterns.find(p => p.type === 'DOUBLE_BOTTOM');
      expect(db).toBeTruthy();
      expect(db.direction).toBe('bullish');
    });
  });

  describe('Head and Shoulders', () => {
    test('detects forming H&S', () => {
      const candles = Array(40).fill(null).map((_, i) => ({
        time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000 - i * 10,
      }));

      const sp = {
        swingHighs: [
          { price: 108, index: 5, time: 5 },   // left shoulder
          { price: 118, index: 15, time: 15 },  // head (highest, >3% above shoulders)
          { price: 109, index: 25, time: 25 },  // right shoulder (within 5% of left)
        ],
        swingLows: [
          { price: 95, index: 10, time: 10 },
          { price: 96, index: 20, time: 20 },
        ],
      };
      const result = detectPatterns(candles, sp);
      const hs = result.patterns.find(p => p.type.includes('HEAD_AND_SHOULDERS'));
      expect(hs).toBeTruthy();
      expect(hs.direction).toBe('bearish');
    });
  });

  describe('Inverse Head and Shoulders', () => {
    test('detects forming inverse H&S', () => {
      const candles = Array(40).fill(null).map((_, i) => ({
        time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
      }));

      const sp = {
        swingHighs: [
          { price: 105, index: 10, time: 10 },
          { price: 106, index: 20, time: 20 },
        ],
        swingLows: [
          { price: 92, index: 5, time: 5 },    // left shoulder
          { price: 82, index: 15, time: 15 },   // head (lowest, >3% below)
          { price: 91, index: 25, time: 25 },   // right shoulder
        ],
      };
      const result = detectPatterns(candles, sp);
      const ihs = result.patterns.find(p => p.type.includes('INVERSE_HEAD_AND_SHOULDERS'));
      expect(ihs).toBeTruthy();
      expect(ihs.direction).toBe('bullish');
    });
  });

  describe('Flag', () => {
    test('detects bull flag after impulse', () => {
      // Build impulse + consolidation
      const candles = [];
      // Pre-impulse
      for (let i = 0; i < 5; i++) {
        candles.push({ time: i, open: 100, high: 102, low: 98, close: 100, volume: 2000 });
      }
      // Impulse (>5% move in <5 candles)
      for (let i = 5; i < 8; i++) {
        candles.push({ time: i, open: 100 + (i - 5) * 4, high: 105 + (i - 5) * 4, low: 99 + (i - 5) * 4, close: 104 + (i - 5) * 4, volume: 3000 });
      }
      // Flag consolidation (tighter range, lower volume)
      for (let i = 8; i < 18; i++) {
        candles.push({ time: i, open: 112, high: 114, low: 110, close: 112, volume: 800 });
      }

      const sp = { swingHighs: [], swingLows: [] };
      const result = detectPatterns(candles, sp);
      const flag = result.patterns.find(p => p.type === 'BULL_FLAG');
      expect(flag).toBeTruthy();
      expect(flag.direction).toBe('bullish');
    });
  });

  describe('Triangle', () => {
    test('detects ascending triangle', () => {
      const candles = Array(30).fill(null).map((_, i) => ({
        time: i, open: 100, high: 110, low: 90, close: 100, volume: 1000,
      }));

      const sp = {
        swingHighs: [
          { price: 110, index: 5, time: 5 },
          { price: 110.5, index: 15, time: 15 },
          { price: 110.2, index: 25, time: 25 },  // flat resistance
        ],
        swingLows: [
          { price: 95, index: 10, time: 10 },
          { price: 98, index: 20, time: 20 },      // rising support
        ],
      };
      const result = detectPatterns(candles, sp);
      const tri = result.patterns.find(p => p.type === 'ASCENDING_TRIANGLE');
      expect(tri).toBeTruthy();
      expect(tri.direction).toBe('bullish');
    });
  });

  describe('Pennant', () => {
    test('detects bull pennant with converging trendlines', () => {
      const candles = [];
      // Pre-impulse
      for (let i = 0; i < 5; i++) candles.push({ time: i, open: 100, high: 102, low: 98, close: 100, volume: 2000 });
      // Impulse
      for (let i = 5; i < 8; i++) candles.push({ time: i, open: 100 + (i - 5) * 4, high: 106 + (i - 5) * 4, low: 99 + (i - 5) * 4, close: 104 + (i - 5) * 4, volume: 3000 });
      // Pennant (converging)
      for (let i = 8; i < 18; i++) candles.push({ time: i, open: 112, high: 114 - (i - 8) * 0.3, low: 110 + (i - 8) * 0.3, close: 112, volume: 600 });

      const sp = {
        swingHighs: [
          { price: 114, index: 9, time: 9 },
          { price: 113, index: 14, time: 14 },  // falling highs
        ],
        swingLows: [
          { price: 110, index: 10, time: 10 },
          { price: 111, index: 15, time: 15 },  // rising lows
        ],
      };
      const result = detectPatterns(candles, sp);
      const pennant = result.patterns.find(p => p.type === 'PENNANT_BULL');
      expect(pennant).toBeTruthy();
      expect(pennant.direction).toBe('bullish');
    });
  });

  test('all pattern types have required fields', () => {
    const candles = Array(30).fill(null).map((_, i) => ({
      time: i, open: 100, high: 105, low: 95, close: 100, volume: 1000,
    }));
    candles[candles.length - 1].close = 88;

    const sp = {
      swingHighs: [
        { price: 110, index: 5, time: 5 },
        { price: 111, index: 15, time: 15 },
      ],
      swingLows: [{ price: 92, index: 10, time: 10 }],
    };

    const result = detectPatterns(candles, sp);
    for (const p of result.patterns) {
      expect(p).toHaveProperty('type');
      expect(p).toHaveProperty('confidence');
      expect(p).toHaveProperty('direction');
      expect(typeof p.confidence).toBe('number');
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(100);
    }
  });
});
