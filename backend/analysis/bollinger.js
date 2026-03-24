'use strict';

const config = require('../config');
const { sma } = require('../utils/math');

/**
 * Bollinger Bands (Murphy Ch.9)
 *
 * Middle band = SMA(20) of closes
 * Upper  = middle + 2 * stddev
 * Lower  = middle - 2 * stddev
 * Bandwidth = (upper - lower) / middle — measures squeeze intensity
 * %B = (close - lower) / (upper - lower) — position within bands
 *
 * Labels:
 *   SQUEEZE       — bandwidth < threshold (volatility compression, imminent move)
 *   BELOW_LOWER   — price below lower band (oversold bounce candidate)
 *   NEAR_LOWER    — %B < 0.20
 *   MID_BAND      — %B between 0.20 and 0.80
 *   NEAR_UPPER    — %B > 0.80
 *   ABOVE_UPPER   — price above upper band (overbought / extended)
 *   INSUFFICIENT_DATA — not enough candles
 *
 * @param {number[]} closes  — array of close prices, oldest first
 * @param {number}   [period]  — SMA period (default from config.bbPeriod)
 * @param {number}   [mult]    — stddev multiplier (default from config.bbStdDev)
 * @returns {{ upper: number|null, middle: number|null, lower: number|null,
 *             bandwidth: number|null, percentB: number|null, squeeze: boolean,
 *             label: string }}
 */
function calcBollingerBands(closes, period, mult) {
  const p = period ?? config.bbPeriod ?? 20;
  const m = mult ?? config.bbStdDev ?? 2;
  const sqThreshold = config.bbSqueezeThreshold ?? 0.10;

  if (!closes || closes.length < p) {
    return { upper: null, middle: null, lower: null, bandwidth: null, percentB: null, squeeze: false, label: 'INSUFFICIENT_DATA' };
  }

  // SMA of the last `p` closes
  const smaValues = sma(closes, p);
  const middle = smaValues[smaValues.length - 1];

  // Standard deviation of the last `p` closes
  const window = closes.slice(-p);
  const variance = window.reduce((sum, v) => sum + (v - middle) ** 2, 0) / p;
  const stddev = Math.sqrt(variance);

  const upper = middle + m * stddev;
  const lower = middle - m * stddev;

  // Bandwidth = (upper - lower) / middle
  const bandwidth = middle !== 0 ? (upper - lower) / middle : 0;

  // %B = (close - lower) / (upper - lower)
  const close = closes[closes.length - 1];
  const bandWidth = upper - lower;
  const percentB = bandWidth !== 0 ? (close - lower) / bandWidth : 0.5;

  // Squeeze detection
  const squeeze = bandwidth < sqThreshold;

  // Label determination — squeeze takes priority
  let label;
  if (squeeze) {
    label = 'SQUEEZE';
  } else if (percentB <= 0) {
    label = 'BELOW_LOWER';
  } else if (percentB < 0.20) {
    label = 'NEAR_LOWER';
  } else if (percentB > 1.0) {
    label = 'ABOVE_UPPER';
  } else if (percentB > 0.80) {
    label = 'NEAR_UPPER';
  } else {
    label = 'MID_BAND';
  }

  // ── Squeeze duration + expansion direction (Murphy Ch.9 enhancement) ──────
  // Track consecutive candles where bandwidth < average bandwidth * 0.5
  let squeezeDuration = 0;
  let expansionDirection = null;
  let squeezeIntensity = null;

  if (closes.length >= p + 5) {
    // Compute bandwidth history for last several candles
    const bwHistory = [];
    for (let i = p; i <= closes.length; i++) {
      const slice = closes.slice(i - p, i);
      const sliceSma = slice.reduce((a, b) => a + b, 0) / p;
      const sliceVar = slice.reduce((s, v) => s + (v - sliceSma) ** 2, 0) / p;
      const sliceStd = Math.sqrt(sliceVar);
      const sliceUpper = sliceSma + m * sliceStd;
      const sliceLower = sliceSma - m * sliceStd;
      bwHistory.push(sliceSma !== 0 ? (sliceUpper - sliceLower) / sliceSma : 0);
    }

    // Average bandwidth over the window
    const avgBandwidth = bwHistory.reduce((a, b) => a + b, 0) / bwHistory.length;
    const sqzThresh = avgBandwidth * 0.5;

    // Count consecutive squeeze candles from the end
    for (let i = bwHistory.length - 1; i >= 0; i--) {
      if (bwHistory[i] < sqzThresh) squeezeDuration++;
      else break;
    }

    // Squeeze intensity = avg / current (higher = tighter)
    if (bandwidth > 0) {
      squeezeIntensity = Math.round((avgBandwidth / bandwidth) * 100) / 100;
    }

    // Expansion direction: if previous candle was in squeeze but current isn't
    if (bwHistory.length >= 2 && squeezeDuration === 0) {
      const prevBw = bwHistory[bwHistory.length - 2];
      if (prevBw < sqzThresh) {
        // Just broke out of squeeze — check direction
        expansionDirection = close > middle ? 'up' : 'down';
      }
    }
  }

  return {
    upper:     Math.round(upper * 1e10) / 1e10,
    middle:    Math.round(middle * 1e10) / 1e10,
    lower:     Math.round(lower * 1e10) / 1e10,
    bandwidth: Math.round(bandwidth * 1e6) / 1e6,
    percentB:  Math.round(percentB * 1e4) / 1e4,
    squeeze,
    squeezeDuration,
    expansionDirection,
    squeezeIntensity,
    label,
  };
}

module.exports = { calcBollingerBands };
