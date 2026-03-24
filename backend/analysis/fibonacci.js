'use strict';

const config = require('../config');

/**
 * Find the swing high and swing low over the candle series, then compute
 * Fibonacci retracement levels. Check if the current price is near any key
 * level (within fibTolerance).
 *
 * @param {object[]} candles  — normalized OHLCV, oldest first
 * @returns {{
 *   swingHigh: number|null,
 *   swingLow: number|null,
 *   levels: { ratio: number, price: number }[],
 *   nearestLevel: number|null,
 *   atFibLevel: boolean,
 *   label: string
 * }}
 */
function calcFibonacci(candles) {
  if (!candles || candles.length < 4) {
    return {
      swingHigh: null, swingLow: null, levels: [],
      nearestLevel: null, atFibLevel: false, label: 'INSUFFICIENT_DATA',
    };
  }

  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const closes = candles.map(c => c.close);

  const swingHigh = Math.max(...highs);
  const swingLow  = Math.min(...lows);
  const range     = swingHigh - swingLow;

  if (range <= 0) {
    return {
      swingHigh, swingLow, levels: [],
      nearestLevel: null, atFibLevel: false, label: 'FLAT',
    };
  }

  // Retracement levels (from swing high down to swing low)
  const levels = config.fibLevels.map(ratio => ({
    ratio,
    price: swingHigh - ratio * range,
  }));

  const currentPrice = closes[closes.length - 1];
  const tol = config.fibTolerance;

  // Find nearest level and whether we're at it
  let nearestLevel = null;
  let nearestDist  = Infinity;
  let atFibLevel   = false;

  for (const lvl of levels) {
    const dist = Math.abs(currentPrice - lvl.price) / lvl.price;
    if (dist < nearestDist) {
      nearestDist  = dist;
      nearestLevel = lvl.ratio;
    }
    if (dist <= tol) atFibLevel = true;
  }

  // High-value levels for scoring
  const highValueLevels = [0.618, 0.786];
  const atHighValueLevel = levels
    .filter(l => highValueLevels.includes(l.ratio))
    .some(l => Math.abs(currentPrice - l.price) / l.price <= tol);

  let label;
  if (atHighValueLevel)    label = 'AT_KEY_LEVEL';
  else if (atFibLevel)     label = 'AT_FIB_LEVEL';
  else if (nearestDist < 0.05) label = 'NEAR_FIB';
  else                     label = 'BETWEEN_LEVELS';

  // ── Retracement depth classification (Murphy Ch.4 enhancement) ──────────
  // How far has price retraced from the swing high?
  const retracementPct = range > 0 ? (swingHigh - currentPrice) / range : 0;
  let retracementDepth = null;
  if (retracementPct < 0.382)       retracementDepth = 'shallow';
  else if (retracementPct <= 0.618) retracementDepth = 'normal';   // golden zone
  else if (retracementPct <= 0.786) retracementDepth = 'deep';
  else                              retracementDepth = 'full';

  return {
    swingHigh,
    swingLow,
    levels,
    nearestLevel,
    atFibLevel,
    atHighValueLevel,
    nearestDist: Math.round(nearestDist * 1000) / 1000,
    retracementDepth,
    retracementPct: Math.round(retracementPct * 1000) / 1000,
    label,
  };
}

module.exports = { calcFibonacci };
