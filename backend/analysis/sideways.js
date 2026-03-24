'use strict';

/**
 * Sideways Market Detector (Murphy Ch.14)
 *
 * Detects range-bound conditions and classifies market regime.
 * Used as an engine modifier (like HTF modulation) — not a standalone signal.
 * Penalizes trend-following signals (MACD, EMA Cross, ADX) in sideways/choppy markets.
 * Boosts mean-reversion signals (BB, RSI) in sideways markets.
 *
 * @param {object[]} candles      — normalized OHLCV, oldest first
 * @param {object}   swingPoints  — from calcSwingPoints()
 * @param {object}   adx          — from calcADX()
 * @param {object}   bollingerBands — from calcBollingerBands()
 * @returns {{ isSideways: boolean, regime: 'trending'|'sideways'|'choppy', rangeWidth: number|null,
 *             rangeDuration: number|null, adxConfirm: boolean }}
 */
function detectSideways(candles, swingPoints, adx, bollingerBands) {
  const defaults = { isSideways: false, regime: 'trending', rangeWidth: null, rangeDuration: null, adxConfirm: false };

  if (!candles || candles.length < 10) return defaults;

  // Use last 20 candles (or all if fewer)
  const window = candles.slice(-Math.min(20, candles.length));
  const highs = window.map(c => c.high);
  const lows = window.map(c => c.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const avgPrice = window.reduce((s, c) => s + c.close, 0) / window.length;

  if (avgPrice <= 0) return defaults;

  // Range detection: (max - min) / avgPrice < 8% = range-bound
  const rangeWidth = (maxHigh - minLow) / avgPrice;
  const isRangeBound = rangeWidth < 0.08;

  // ADX confirmation: ADX < 20 supports sideways
  const adxValue = adx?.value ?? null;
  const adxConfirm = adxValue !== null && adxValue < 20;

  // Bollinger confirmation: tight bandwidth supports sideways
  const bbSqueeze = bollingerBands?.squeeze ?? false;
  const bbBandwidth = bollingerBands?.bandwidth ?? null;
  const bbConfirm = bbBandwidth !== null && bbBandwidth < 0.06;

  // Count swing direction changes to detect choppiness
  let directionChanges = 0;
  if (swingPoints) {
    // Merge and sort all swing points by index
    const allSwings = [
      ...(swingPoints.swingHighs || []).map(s => ({ ...s, swingType: 'high' })),
      ...(swingPoints.swingLows || []).map(s => ({ ...s, swingType: 'low' })),
    ].sort((a, b) => a.index - b.index);

    // Count direction changes in last 20 candles
    const startIdx = Math.max(0, candles.length - 20);
    const recentSwings = allSwings.filter(s => s.index >= startIdx);
    for (let i = 1; i < recentSwings.length; i++) {
      if (recentSwings[i].swingType !== recentSwings[i - 1].swingType) {
        directionChanges++;
      }
    }
  }

  // Choppy = frequent reversals (>4 changes in 20 candles) WITHOUT tight range
  const isChoppy = directionChanges > 4 && !isRangeBound;

  // Classify regime
  let regime;
  if (isChoppy) {
    regime = 'choppy';
  } else if (isRangeBound || (adxConfirm && (bbConfirm || bbSqueeze))) {
    regime = 'sideways';
  } else {
    regime = 'trending';
  }

  return {
    isSideways: regime === 'sideways',
    regime,
    rangeWidth: Math.round(rangeWidth * 10000) / 10000,
    rangeDuration: window.length,
    adxConfirm,
  };
}

module.exports = { detectSideways };
