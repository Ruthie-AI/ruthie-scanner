'use strict';

/**
 * Support & Resistance Tracking (Murphy Ch.4)
 *
 * Infrastructure module — finds key price levels from swing points, volume clusters,
 * and round numbers. Consumed by chart patterns, R:R gate, and dynamic SL.
 *
 * @param {object[]} candles      — normalized OHLCV, oldest first
 * @param {object}   swingPoints  — from calcSwingPoints()
 * @returns {{ supports: object[], resistances: object[], zones: object[] }}
 */
function findLevels(candles, swingPoints) {
  const empty = { supports: [], resistances: [], zones: [] };
  if (!candles || candles.length < 4) return empty;

  const currentPrice = candles[candles.length - 1].close;
  if (!currentPrice || currentPrice <= 0) return empty;

  const rawLevels = [];

  // 1. Swing-based levels — cluster swing highs/lows within 1.5% proximity
  if (swingPoints) {
    for (const sw of (swingPoints.swingLows || [])) {
      rawLevels.push({ price: sw.price, type: 'swing', touches: 1, firstSeen: sw.index, lastTouched: sw.index });
    }
    for (const sw of (swingPoints.swingHighs || [])) {
      rawLevels.push({ price: sw.price, type: 'swing', touches: 1, firstSeen: sw.index, lastTouched: sw.index });
    }
  }

  // 2. Volume-based levels — price levels with >2× average volume
  const avgVolume = candles.reduce((s, c) => s + (c.volume || 0), 0) / candles.length;
  if (avgVolume > 0) {
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if ((c.volume || 0) > avgVolume * 2) {
        const midPrice = (c.high + c.low) / 2;
        rawLevels.push({ price: midPrice, type: 'volume', touches: 1, firstSeen: i, lastTouched: i });
      }
    }
  }

  // 3. Round number levels — relative to price magnitude
  const magnitude = _roundMagnitude(currentPrice);
  if (magnitude > 0) {
    // Find nearest round numbers above and below
    const roundBelow = Math.floor(currentPrice / magnitude) * magnitude;
    const roundAbove = Math.ceil(currentPrice / magnitude) * magnitude;
    if (roundBelow > 0 && roundBelow !== currentPrice) {
      rawLevels.push({ price: roundBelow, type: 'round', touches: 0, firstSeen: 0, lastTouched: 0 });
    }
    if (roundAbove > 0 && roundAbove !== currentPrice) {
      rawLevels.push({ price: roundAbove, type: 'round', touches: 0, firstSeen: 0, lastTouched: 0 });
    }
  }

  // Cluster overlapping levels within 1.5% proximity
  const clustered = _clusterLevels(rawLevels, 0.015);

  // Calculate strength: touches × recency weight
  const maxIdx = candles.length - 1;
  for (const lvl of clustered) {
    const recencyWeight = maxIdx > 0 ? 0.5 + 0.5 * (lvl.lastTouched / maxIdx) : 1;
    lvl.strength = Math.min(5, Math.round(lvl.touches * recencyWeight * 10) / 10);
  }

  // Split into supports (below current price) and resistances (above)
  const supports = clustered
    .filter(l => l.price < currentPrice)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);

  const resistances = clustered
    .filter(l => l.price >= currentPrice)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);

  // Zones = merged supports + resistances
  const zones = [...supports, ...resistances].sort((a, b) => a.price - b.price);

  return { supports, resistances, zones };
}

/**
 * Determine round number magnitude relative to price.
 */
function _roundMagnitude(price) {
  if (price >= 1)       return 1;
  if (price >= 0.1)     return 0.1;
  if (price >= 0.01)    return 0.01;
  if (price >= 0.001)   return 0.001;
  if (price >= 0.0001)  return 0.0001;
  return 0.00001;
}

/**
 * Cluster levels within proximity threshold (fraction of price).
 * Merges touching levels — takes average price, sums touches, tracks first/last.
 */
function _clusterLevels(levels, threshold) {
  if (levels.length === 0) return [];

  // Sort by price
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const clusters = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const lvl = sorted[i];
    const dist = Math.abs(lvl.price - current.price) / current.price;

    if (dist <= threshold) {
      // Merge into current cluster
      current.price = (current.price * current.touches + lvl.price * lvl.touches) / (current.touches + lvl.touches);
      current.touches += lvl.touches;
      current.firstSeen = Math.min(current.firstSeen, lvl.firstSeen);
      current.lastTouched = Math.max(current.lastTouched, lvl.lastTouched);
      // Prefer non-round types
      if (lvl.type !== 'round') current.type = lvl.type;
    } else {
      clusters.push(current);
      current = { ...lvl };
    }
  }
  clusters.push(current);

  return clusters;
}

module.exports = { findLevels };
