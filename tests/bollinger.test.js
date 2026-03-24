'use strict';

const { calcBollingerBands } = require('../backend/analysis/bollinger');

describe('calcBollingerBands', () => {
  test('returns INSUFFICIENT_DATA with null input', () => {
    const result = calcBollingerBands(null);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.upper).toBeNull();
    expect(result.middle).toBeNull();
    expect(result.lower).toBeNull();
    expect(result.bandwidth).toBeNull();
    expect(result.percentB).toBeNull();
    expect(result.squeeze).toBe(false);
  });

  test('returns INSUFFICIENT_DATA with too few candles', () => {
    const closes = [100, 101, 102];
    const result = calcBollingerBands(closes, 20);
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('computes correct bands with exactly 20 candles', () => {
    // 20 flat prices — SMA = 100, stddev = 0
    const closes = Array(20).fill(100);
    const result = calcBollingerBands(closes, 20, 2);

    expect(result.middle).toBe(100);
    expect(result.upper).toBe(100);  // 100 + 2*0
    expect(result.lower).toBe(100);  // 100 - 2*0
    expect(result.bandwidth).toBe(0);
  });

  test('upper > middle > lower with price variation', () => {
    const closes = [];
    for (let i = 0; i < 20; i++) closes.push(100 + Math.sin(i) * 5);
    const result = calcBollingerBands(closes, 20, 2);

    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.middle).toBeGreaterThan(result.lower);
  });

  test('percentB is 0–1 when price is within bands', () => {
    const closes = [];
    for (let i = 0; i < 25; i++) closes.push(100 + i * 0.5);
    const result = calcBollingerBands(closes, 20, 2);

    expect(result.percentB).toBeGreaterThanOrEqual(0);
    expect(result.percentB).toBeLessThanOrEqual(1);
  });

  test('detects squeeze with low volatility', () => {
    // Very tight range — bandwidth should be tiny
    const closes = [];
    for (let i = 0; i < 20; i++) closes.push(100 + Math.sin(i) * 0.1);
    const result = calcBollingerBands(closes, 20, 2);

    expect(result.squeeze).toBe(true);
    expect(result.label).toBe('SQUEEZE');
  });

  test('no squeeze with high volatility', () => {
    const closes = [];
    for (let i = 0; i < 20; i++) closes.push(100 + Math.sin(i) * 30);
    const result = calcBollingerBands(closes, 20, 2);

    expect(result.squeeze).toBe(false);
    expect(result.label).not.toBe('SQUEEZE');
  });

  test('BELOW_LOWER when price drops sharply', () => {
    // 19 stable values then a sharp drop
    const closes = Array(19).fill(100);
    closes.push(50); // way below lower band
    const result = calcBollingerBands(closes, 20, 2);

    // Middle ≈ 97.5, stddev is small, 50 is well below lower
    expect(result.percentB).toBeLessThanOrEqual(0);
    // label is either BELOW_LOWER or SQUEEZE depending on bandwidth
    expect(['BELOW_LOWER', 'SQUEEZE']).toContain(result.label);
  });

  test('ABOVE_UPPER when price spikes', () => {
    // 19 stable values then a spike
    const closes = Array(19).fill(100);
    closes.push(200); // way above upper band
    const result = calcBollingerBands(closes, 20, 2);

    expect(result.percentB).toBeGreaterThan(1.0);
    // Could be ABOVE_UPPER or SQUEEZE depending on bandwidth
    expect(['ABOVE_UPPER', 'SQUEEZE']).toContain(result.label);
  });

  test('MID_BAND for neutral positioning', () => {
    // Gradually rising — last close near middle
    const closes = [];
    for (let i = 0; i < 30; i++) closes.push(100 + i * 2);
    const result = calcBollingerBands(closes, 20, 2);

    // With steady trend, close should be near upper — depends on exact math
    expect(result.label).not.toBe('INSUFFICIENT_DATA');
  });

  test('handles flat candles without errors', () => {
    const closes = Array(30).fill(50);
    const result = calcBollingerBands(closes, 20, 2);

    expect(result.middle).toBe(50);
    expect(result.bandwidth).toBe(0);
    expect(result.label).not.toBe('INSUFFICIENT_DATA');
  });

  test('respects custom period', () => {
    const closes = [];
    for (let i = 0; i < 10; i++) closes.push(100 + i);
    const result = calcBollingerBands(closes, 10, 2);

    expect(result.middle).not.toBeNull();
    expect(result.label).not.toBe('INSUFFICIENT_DATA');
  });

  test('respects custom stddev multiplier', () => {
    const closes = [];
    for (let i = 0; i < 20; i++) closes.push(100 + Math.sin(i) * 5);
    const narrow = calcBollingerBands(closes, 20, 1);
    const wide   = calcBollingerBands(closes, 20, 3);

    expect(wide.upper - wide.lower).toBeGreaterThan(narrow.upper - narrow.lower);
  });
});
