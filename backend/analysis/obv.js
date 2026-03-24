'use strict';

/**
 * OBV — On-Balance Volume (Murphy Ch.7)
 *
 * Running sum: close > prev → OBV += volume; close < prev → OBV -= volume; equal → unchanged.
 * What matters is the slope (direction), not the absolute value.
 *
 * Slope = linear regression over last 5 OBV values.
 * Price slope over same window for divergence detection.
 * Diverge = OBV slope disagrees with price slope direction.
 *
 * Labels:
 *   OBV_CONFIRM_BULL — OBV rising + price rising (volume confirms uptrend)
 *   OBV_CONFIRM_BEAR — OBV falling + price falling (volume confirms downtrend)
 *   OBV_BULL_DIVERGE — OBV rising + price falling (smart money accumulating)
 *   OBV_BEAR_DIVERGE — OBV falling + price rising (smart money distributing)
 *   OBV_FLAT         — no clear direction
 *   NO_VOLUME_DATA   — synthetic candles with zero volume
 *   INSUFFICIENT_DATA — not enough candles
 *
 * @param {object[]} candles   — normalized OHLCV, oldest first
 * @param {number}   [lookback=5] — slope lookback window
 * @returns {{ value: number|null, slope: number|null, priceDiverging: boolean, label: string }}
 */
function calcOBV(candles, lookback = 5) {
  if (!candles || candles.length < 2) {
    return { value: null, slope: null, priceDiverging: false, label: 'INSUFFICIENT_DATA' };
  }

  // Check for volume data — synthetic DexScreener candles have zero volume
  const hasVolume = candles.some(c => c.volume > 0);
  if (!hasVolume) {
    return { value: null, slope: null, priceDiverging: false, label: 'NO_VOLUME_DATA' };
  }

  // Build OBV series
  const obvSeries = [0]; // start at 0
  for (let i = 1; i < candles.length; i++) {
    const prev = obvSeries[obvSeries.length - 1];
    if (candles[i].close > candles[i - 1].close) {
      obvSeries.push(prev + candles[i].volume);
    } else if (candles[i].close < candles[i - 1].close) {
      obvSeries.push(prev - candles[i].volume);
    } else {
      obvSeries.push(prev);
    }
  }

  const currentOBV = obvSeries[obvSeries.length - 1];

  // Need at least `lookback` OBV values for slope
  if (obvSeries.length < lookback) {
    return { value: currentOBV, slope: null, priceDiverging: false, label: 'INSUFFICIENT_DATA' };
  }

  // Slopes over last `lookback` values
  const recentOBV    = obvSeries.slice(-lookback);
  const recentCloses = candles.slice(-lookback).map(c => c.close);

  const obvSlope   = slope(recentOBV);
  const priceSlope = slope(recentCloses);

  // Flat threshold — avoid noise when slopes are near zero
  const obvUp   = obvSlope > 0;
  const obvDown = obvSlope < 0;
  const priceUp   = priceSlope > 0;
  const priceDown = priceSlope < 0;

  let label;
  let priceDiverging = false;

  if (obvUp && priceUp) {
    label = 'OBV_CONFIRM_BULL';
  } else if (obvDown && priceDown) {
    label = 'OBV_CONFIRM_BEAR';
  } else if (obvUp && priceDown) {
    label = 'OBV_BULL_DIVERGE';
    priceDiverging = true;
  } else if (obvDown && priceUp) {
    label = 'OBV_BEAR_DIVERGE';
    priceDiverging = true;
  } else {
    label = 'OBV_FLAT';
  }

  return {
    value: currentOBV,
    slope: Math.round(obvSlope * 1e4) / 1e4,
    priceDiverging,
    label,
  };
}

/**
 * Simple linear regression slope over an array of values.
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

module.exports = { calcOBV };
