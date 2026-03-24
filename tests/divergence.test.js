'use strict';

const { calcDivergence } = require('../backend/analysis/divergence');

/**
 * Build mock swing points with explicit highs/lows.
 * Each high: { price, index }, each low: { price, index }
 */
function makeSwingPoints(highs, lows) {
  return {
    swingHighs: highs.map(h => ({ price: h.price, index: h.index, time: Date.now() })),
    swingLows:  lows.map(l => ({ price: l.price, index: l.index, time: Date.now() })),
    trend: null,
    higherHighs: null,
    higherLows: null,
    label: 'TEST',
  };
}

/**
 * Build a mock RSI result with _allValues at specific indices.
 * rsiMap: { candleIndex: rsiValue, ... }
 * closesLength: total candle count (determines offset)
 */
function makeRsi(rsiMap, closesLength, rsiPeriod = 14) {
  const arrLen = closesLength - rsiPeriod;
  const values = new Array(arrLen).fill(50); // default neutral
  for (const [candleIdx, rsiVal] of Object.entries(rsiMap)) {
    const arrIdx = Number(candleIdx) - rsiPeriod;
    if (arrIdx >= 0 && arrIdx < arrLen) values[arrIdx] = rsiVal;
  }
  return { value: values[values.length - 1], label: 'NEUTRAL', _allValues: values };
}

/**
 * Build a mock MACD result with _allResults at specific indices.
 * macdMap: { candleIndex: histogramValue, ... }
 */
function makeMacd(macdMap, closesLength, macdOffset = 33) {
  const arrLen = closesLength - macdOffset;
  const results = new Array(arrLen).fill(null).map(() => ({ MACD: 0, signal: 0, histogram: 0 }));
  for (const [candleIdx, histVal] of Object.entries(macdMap)) {
    const arrIdx = Number(candleIdx) - macdOffset;
    if (arrIdx >= 0 && arrIdx < arrLen) {
      results[arrIdx] = { MACD: 0, signal: 0, histogram: histVal };
    }
  }
  return {
    macdLine: 0, signalLine: 0, histogram: 0,
    bullishCross: false, bearishCross: false,
    label: 'NEUTRAL', _allResults: results,
  };
}

const CLOSES_LEN = 50;

describe('calcDivergence', () => {
  test('returns INSUFFICIENT_DATA with null/missing inputs', () => {
    const result = calcDivergence(null, null, null, 0);
    expect(result.rsiDivergence.label).toBe('INSUFFICIENT_DATA');
    expect(result.macdDivergence.label).toBe('INSUFFICIENT_DATA');
    expect(result.rsiDivergence.bullish).toBe(false);
    expect(result.rsiDivergence.bearish).toBe(false);
  });

  test('returns INSUFFICIENT_DATA with empty RSI/MACD arrays', () => {
    const sp = makeSwingPoints(
      [{ price: 10, index: 20 }, { price: 12, index: 30 }],
      [{ price: 5, index: 15 }, { price: 4, index: 25 }]
    );
    const rsi = { value: null, label: 'INSUFFICIENT_DATA', _allValues: [] };
    const macd = { macdLine: null, label: 'INSUFFICIENT_DATA', _allResults: [] };
    const result = calcDivergence(sp, rsi, macd, CLOSES_LEN);
    expect(result.rsiDivergence.label).toBe('INSUFFICIENT_DATA');
    expect(result.macdDivergence.label).toBe('INSUFFICIENT_DATA');
  });

  test('returns NONE with < 2 swing highs and < 2 swing lows', () => {
    const sp = makeSwingPoints(
      [{ price: 10, index: 20 }],  // only 1 high
      [{ price: 5, index: 15 }]    // only 1 low
    );
    const rsi = makeRsi({}, CLOSES_LEN);
    const macd = makeMacd({}, CLOSES_LEN);
    const result = calcDivergence(sp, rsi, macd, CLOSES_LEN);
    // Not enough swing points to compare — no divergence detected
    expect(result.rsiDivergence.bullish).toBe(false);
    expect(result.rsiDivergence.bearish).toBe(false);
    expect(result.rsiDivergence.label).toBe('NONE');
  });

  test('detects bearish RSI divergence — higher price high + lower RSI', () => {
    const sp = makeSwingPoints(
      [{ price: 10, index: 20 }, { price: 12, index: 35 }],  // higher high
      []
    );
    // RSI at index 20 = 70, RSI at index 35 = 60 → lower RSI high
    const rsi = makeRsi({ 20: 70, 35: 60 }, CLOSES_LEN);
    const macd = makeMacd({}, CLOSES_LEN);
    const result = calcDivergence(sp, rsi, macd, CLOSES_LEN);

    expect(result.rsiDivergence.bearish).toBe(true);
    expect(result.rsiDivergence.bullish).toBe(false);
    expect(result.rsiDivergence.label).toBe('RSI_BEAR_DIVERGENCE');
  });

  test('detects bullish RSI divergence — lower price low + higher RSI', () => {
    const sp = makeSwingPoints(
      [],
      [{ price: 5, index: 20 }, { price: 3, index: 35 }]  // lower low
    );
    // RSI at index 20 = 25, RSI at index 35 = 35 → higher RSI low
    const rsi = makeRsi({ 20: 25, 35: 35 }, CLOSES_LEN);
    const macd = makeMacd({}, CLOSES_LEN);
    const result = calcDivergence(sp, rsi, macd, CLOSES_LEN);

    expect(result.rsiDivergence.bullish).toBe(true);
    expect(result.rsiDivergence.bearish).toBe(false);
    expect(result.rsiDivergence.label).toBe('RSI_BULL_DIVERGENCE');
  });

  test('detects bearish MACD divergence — higher price high + lower histogram', () => {
    const sp = makeSwingPoints(
      [{ price: 10, index: 35 }, { price: 12, index: 45 }],  // higher high
      []
    );
    const rsi = makeRsi({}, CLOSES_LEN);
    // Histogram at index 35 = 0.5, at index 45 = 0.2 → lower histogram high
    const macd = makeMacd({ 35: 0.5, 45: 0.2 }, CLOSES_LEN);
    const result = calcDivergence(sp, rsi, macd, CLOSES_LEN);

    expect(result.macdDivergence.bearish).toBe(true);
    expect(result.macdDivergence.bullish).toBe(false);
    expect(result.macdDivergence.label).toBe('MACD_BEAR_DIVERGENCE');
  });

  test('detects bullish MACD divergence — lower price low + higher histogram', () => {
    const sp = makeSwingPoints(
      [],
      [{ price: 5, index: 35 }, { price: 3, index: 45 }]  // lower low
    );
    const rsi = makeRsi({}, CLOSES_LEN);
    // Histogram at index 35 = -0.5, at index 45 = -0.2 → higher histogram low
    const macd = makeMacd({ 35: -0.5, 45: -0.2 }, CLOSES_LEN);
    const result = calcDivergence(sp, rsi, macd, CLOSES_LEN);

    expect(result.macdDivergence.bullish).toBe(true);
    expect(result.macdDivergence.bearish).toBe(false);
    expect(result.macdDivergence.label).toBe('MACD_BULL_DIVERGENCE');
  });

  test('no divergence when price and RSI move in same direction', () => {
    const sp = makeSwingPoints(
      [{ price: 10, index: 20 }, { price: 12, index: 35 }],  // higher high
      [{ price: 5, index: 15 }, { price: 3, index: 30 }]     // lower low
    );
    // RSI also makes higher high and lower low → no divergence
    const rsi = makeRsi({ 20: 60, 35: 70, 15: 35, 30: 25 }, CLOSES_LEN);
    const macd = makeMacd({}, CLOSES_LEN);
    const result = calcDivergence(sp, rsi, macd, CLOSES_LEN);

    expect(result.rsiDivergence.bullish).toBe(false);
    expect(result.rsiDivergence.bearish).toBe(false);
    expect(result.rsiDivergence.label).toBe('NONE');
  });

  test('detects double divergence — both RSI and MACD bullish', () => {
    const sp = makeSwingPoints(
      [],
      [{ price: 5, index: 35 }, { price: 3, index: 45 }]  // lower low
    );
    // RSI higher low
    const rsi = makeRsi({ 35: 25, 45: 35 }, CLOSES_LEN);
    // MACD histogram higher low
    const macd = makeMacd({ 35: -0.5, 45: -0.2 }, CLOSES_LEN);
    const result = calcDivergence(sp, rsi, macd, CLOSES_LEN);

    expect(result.rsiDivergence.bullish).toBe(true);
    expect(result.macdDivergence.bullish).toBe(true);
  });

  test('handles swing point indices outside RSI array range gracefully', () => {
    const sp = makeSwingPoints(
      [{ price: 10, index: 2 }, { price: 12, index: 5 }],  // indices below RSI offset
      []
    );
    const rsi = makeRsi({}, CLOSES_LEN);
    const macd = makeMacd({}, CLOSES_LEN);
    const result = calcDivergence(sp, rsi, macd, CLOSES_LEN);

    // Indices 2 and 5 are below rsiOffset=14 → can't look up RSI → no divergence
    expect(result.rsiDivergence.bearish).toBe(false);
    expect(result.rsiDivergence.bullish).toBe(false);
  });

  test('handles missing _allValues/_allResults gracefully', () => {
    const sp = makeSwingPoints(
      [{ price: 10, index: 20 }, { price: 12, index: 35 }],
      []
    );
    const rsi = { value: 50, label: 'NEUTRAL' };   // no _allValues
    const macd = { macdLine: 0, label: 'NEUTRAL' }; // no _allResults
    const result = calcDivergence(sp, rsi, macd, CLOSES_LEN);

    expect(result.rsiDivergence.label).toBe('INSUFFICIENT_DATA');
    expect(result.macdDivergence.label).toBe('INSUFFICIENT_DATA');
  });
});
