'use strict';

/**
 * Volume-Price Confirmation (Murphy Ch.6 & Ch.7)
 *
 * Core principle: volume should expand in the direction of the existing trend.
 *   - Rising price + rising volume  = bullish confirmation
 *   - Rising price + falling volume = bearish divergence (warning)
 *   - Falling price + rising volume = bearish confirmation
 *   - Falling price + falling volume = selling exhaustion (potential reversal)
 *
 * Uses the last N candles (default 5) to compute short-term price and volume
 * direction via linear regression slope sign.
 *
 * @param {object[]} candles — normalized OHLCV, oldest first
 * @param {number}   [lookback=5] — number of recent candles to evaluate
 * @returns {{
 *   priceSlope: number|null,
 *   volumeSlope: number|null,
 *   confirmed: boolean,
 *   label: string
 * }}
 */
function calcVolumeTrend(candles, lookback = 4) {
  if (!candles || candles.length < lookback) {
    return { priceSlope: null, volumeSlope: null, confirmed: false, label: 'INSUFFICIENT_DATA' };
  }

  const recent = candles.slice(-lookback);

  // Skip if all volumes are 0 (synthetic candles from DexScreener have no volume)
  const hasVolume = recent.some(c => c.volume > 0);
  if (!hasVolume) {
    return { priceSlope: null, volumeSlope: null, confirmed: false, label: 'NO_VOLUME_DATA' };
  }

  // Skip if all candles are identical (DexScreener synthetic — same price/vol repeated)
  const allSameClose = recent.every(c => c.close === recent[0].close);
  const allSameVol   = recent.every(c => c.volume === recent[0].volume);
  if (allSameClose && allSameVol) {
    return { priceSlope: null, volumeSlope: null, confirmed: false, label: 'NO_VOLUME_DATA' };
  }

  const closes  = recent.map(c => c.close);
  const volumes = recent.map(c => c.volume);

  const priceSlope  = slope(closes);
  const volumeSlope = slope(volumes);

  const priceUp  = priceSlope > 0;
  const priceDown = priceSlope < 0;
  const volUp    = volumeSlope > 0;
  const volDown  = volumeSlope < 0;

  let label;
  let confirmed;

  if (priceUp && volUp) {
    // Murphy: strongest bullish signal — trend confirmed by volume
    label = 'VOL_CONFIRM_BULL';
    confirmed = true;
  } else if (priceDown && volUp) {
    // Murphy: bearish — selling pressure with volume behind it
    label = 'VOL_CONFIRM_BEAR';
    confirmed = true;
  } else if (priceUp && volDown) {
    // Murphy: warning — rally on declining volume, divergence
    label = 'VOL_DIVERGE_WARN';
    confirmed = false;
  } else if (priceDown && volDown) {
    // Murphy: selling exhaustion — decline losing steam
    label = 'VOL_EXHAUSTION';
    confirmed = false;
  } else {
    label = 'VOL_NEUTRAL';
    confirmed = false;
  }

  return {
    priceSlope:  Math.round(priceSlope * 1e10) / 1e10,
    volumeSlope: Math.round(volumeSlope * 1e4) / 1e4,
    confirmed,
    label,
  };
}

/**
 * Simple linear regression slope over an array of values.
 * Positive = rising, negative = falling.
 */
function slope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX  += i;
    sumY  += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

module.exports = { calcVolumeTrend };
