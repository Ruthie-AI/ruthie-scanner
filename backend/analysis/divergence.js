'use strict';

/**
 * Divergence Detection — RSI + MACD (Murphy Ch.10)
 *
 * "Divergences are the single most indicative characteristic of RSI."
 *
 * Bearish divergence: price makes a HIGHER high, oscillator makes a LOWER high
 *   → momentum fading, reversal likely downward
 *
 * Bullish divergence: price makes a LOWER low, oscillator makes a HIGHER low
 *   → selling exhaustion, reversal likely upward
 *
 * Consumes swing points (peaks/troughs with candle indices) and full per-candle
 * RSI/MACD arrays exposed via _allValues/_allResults.
 *
 * @param {object} swingPoints — from calcSwingPoints()
 * @param {object} rsi        — from calcRSI() with _allValues
 * @param {object} macd       — from calcMACD() with _allResults
 * @param {number} closesLength — length of the closes array used for TA
 * @returns {{
 *   rsiDivergence:  { bullish: boolean, bearish: boolean, label: string },
 *   macdDivergence: { bullish: boolean, bearish: boolean, label: string },
 * }}
 */
function calcDivergence(swingPoints, rsi, macd, closesLength) {
  const empty = {
    rsiDivergence:  { bullish: false, bearish: false, label: 'INSUFFICIENT_DATA' },
    macdDivergence: { bullish: false, bearish: false, label: 'INSUFFICIENT_DATA' },
  };

  if (!swingPoints || !rsi || !macd || !closesLength) return empty;

  const rsiValues  = rsi._allValues  || [];
  const macdResults = macd._allResults || [];

  const { swingHighs = [], swingLows = [] } = swingPoints;

  // RSI index mapping: RSI array length = closesLength - rsiPeriod
  // RSI value for candle index i = rsiValues[i - rsiOffset]
  const rsiOffset  = closesLength - rsiValues.length;

  // MACD index mapping: MACD results array is shorter than closes
  // MACD result for candle index i = macdResults[i - macdOffset]
  const macdOffset = closesLength - macdResults.length;

  const rsiDivergence  = _detectRsiDivergence(swingHighs, swingLows, rsiValues, rsiOffset);
  const macdDivergence = _detectMacdDivergence(swingHighs, swingLows, macdResults, macdOffset);

  return { rsiDivergence, macdDivergence };
}

/**
 * Detect RSI divergence using the last 2 swing highs / swing lows.
 */
function _detectRsiDivergence(swingHighs, swingLows, rsiValues, offset) {
  if (rsiValues.length === 0) {
    return { bullish: false, bearish: false, label: 'INSUFFICIENT_DATA' };
  }

  let bearish = false;
  let bullish = false;

  // Bearish: last 2 swing highs — price higher high + RSI lower high
  if (swingHighs.length >= 2) {
    const prev = swingHighs[swingHighs.length - 2];
    const last = swingHighs[swingHighs.length - 1];
    const prevRsi = _rsiAt(rsiValues, prev.index, offset);
    const lastRsi = _rsiAt(rsiValues, last.index, offset);
    if (prevRsi !== null && lastRsi !== null) {
      bearish = last.price > prev.price && lastRsi < prevRsi;
    }
  }

  // Bullish: last 2 swing lows — price lower low + RSI higher low
  if (swingLows.length >= 2) {
    const prev = swingLows[swingLows.length - 2];
    const last = swingLows[swingLows.length - 1];
    const prevRsi = _rsiAt(rsiValues, prev.index, offset);
    const lastRsi = _rsiAt(rsiValues, last.index, offset);
    if (prevRsi !== null && lastRsi !== null) {
      bullish = last.price < prev.price && lastRsi > prevRsi;
    }
  }

  let label = 'NONE';
  if (bullish && bearish) label = 'RSI_BULL_DIVERGENCE'; // bullish takes priority (buy signal)
  else if (bullish)       label = 'RSI_BULL_DIVERGENCE';
  else if (bearish)       label = 'RSI_BEAR_DIVERGENCE';

  return { bullish, bearish, label };
}

/**
 * Detect MACD histogram divergence using the last 2 swing highs / swing lows.
 */
function _detectMacdDivergence(swingHighs, swingLows, macdResults, offset) {
  if (macdResults.length === 0) {
    return { bullish: false, bearish: false, label: 'INSUFFICIENT_DATA' };
  }

  let bearish = false;
  let bullish = false;

  // Bearish: last 2 swing highs — price higher high + histogram lower high
  if (swingHighs.length >= 2) {
    const prev = swingHighs[swingHighs.length - 2];
    const last = swingHighs[swingHighs.length - 1];
    const prevHist = _macdHistAt(macdResults, prev.index, offset);
    const lastHist = _macdHistAt(macdResults, last.index, offset);
    if (prevHist !== null && lastHist !== null) {
      bearish = last.price > prev.price && lastHist < prevHist;
    }
  }

  // Bullish: last 2 swing lows — price lower low + histogram higher low
  if (swingLows.length >= 2) {
    const prev = swingLows[swingLows.length - 2];
    const last = swingLows[swingLows.length - 1];
    const prevHist = _macdHistAt(macdResults, prev.index, offset);
    const lastHist = _macdHistAt(macdResults, last.index, offset);
    if (prevHist !== null && lastHist !== null) {
      bullish = last.price < prev.price && lastHist > prevHist;
    }
  }

  let label = 'NONE';
  if (bullish && bearish) label = 'MACD_BULL_DIVERGENCE';
  else if (bullish)       label = 'MACD_BULL_DIVERGENCE';
  else if (bearish)       label = 'MACD_BEAR_DIVERGENCE';

  return { bullish, bearish, label };
}

/** Safe RSI lookup by candle index → array index */
function _rsiAt(rsiValues, candleIndex, offset) {
  const idx = candleIndex - offset;
  if (idx < 0 || idx >= rsiValues.length) return null;
  return rsiValues[idx];
}

/** Safe MACD histogram lookup by candle index → array index */
function _macdHistAt(macdResults, candleIndex, offset) {
  const idx = candleIndex - offset;
  if (idx < 0 || idx >= macdResults.length) return null;
  const entry = macdResults[idx];
  return entry?.histogram ?? null;
}

module.exports = { calcDivergence };
