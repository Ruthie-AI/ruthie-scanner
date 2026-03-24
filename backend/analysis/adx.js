'use strict';

const config = require('../config');
const { wilderSmooth, trueRange } = require('../utils/math');

/**
 * ADX — Average Directional Index (Wilder, Murphy Ch.15)
 *
 * Measures trend STRENGTH, not direction. High ADX = trending (any direction),
 * low ADX = ranging/choppy. Critical for filtering trend-following signals
 * (EMA, MACD) — they whipsaw in ranging markets.
 *
 * Algorithm:
 *   1. True Range (TR)
 *   2. +DM / -DM (directional movement)
 *   3. Wilder smooth TR, +DM, -DM over period
 *   4. +DI = smoothed +DM / smoothed TR × 100
 *   5. -DI = smoothed -DM / smoothed TR × 100
 *   6. DX = |+DI − -DI| / (+DI + -DI) × 100
 *   7. ADX = Wilder smooth DX over period
 *
 * Labels:
 *   STRONG_TREND   — ADX ≥ 40 (strong directional move)
 *   TRENDING       — ADX ≥ adxTrendingMin (default 25)
 *   WEAK_TREND     — ADX between adxRangingMax and adxTrendingMin
 *   RANGING        — ADX ≤ adxRangingMax (default 20)
 *   INSUFFICIENT_DATA — not enough candles
 *
 * @param {object[]} candles   — normalized OHLCV, oldest first
 * @param {number}   [period]  — ADX period (default from config.adxPeriod)
 * @returns {{
 *   value: number|null,
 *   plusDI: number|null,
 *   minusDI: number|null,
 *   rising: boolean|null,
 *   label: string
 * }}
 */
function calcADX(candles, period) {
  const p = period ?? config.adxPeriod ?? 14;
  const minCandles = p * 2;

  if (!candles || candles.length < minCandles) {
    return { value: null, plusDI: null, minusDI: null, rising: null, label: 'INSUFFICIENT_DATA' };
  }

  // Step 1-2: Compute TR, +DM, -DM for each bar (starting from index 1)
  const trArr   = trueRange(candles);
  const plusDM   = [];
  const minusDM  = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const upMove   = curr.high - prev.high;
    const downMove = prev.low  - curr.low;

    if (upMove > downMove && upMove > 0) {
      plusDM.push(upMove);
      minusDM.push(0);
    } else if (downMove > upMove && downMove > 0) {
      plusDM.push(0);
      minusDM.push(downMove);
    } else {
      plusDM.push(0);
      minusDM.push(0);
    }
  }

  // Step 3: Wilder smoothing

  const smoothTR     = wilderSmooth(trArr,   p);
  const smoothPlusDM = wilderSmooth(plusDM,   p);
  const smoothMinDM  = wilderSmooth(minusDM,  p);

  if (smoothTR.length === 0) {
    return { value: null, plusDI: null, minusDI: null, rising: null, label: 'INSUFFICIENT_DATA' };
  }

  // Step 4-5: +DI and -DI
  const plusDIs  = [];
  const minusDIs = [];
  for (let i = 0; i < smoothTR.length; i++) {
    const tr = smoothTR[i];
    plusDIs.push(tr > 0  ? (smoothPlusDM[i] / tr) * 100 : 0);
    minusDIs.push(tr > 0 ? (smoothMinDM[i]  / tr) * 100 : 0);
  }

  // Step 6: DX
  const dxArr = [];
  for (let i = 0; i < plusDIs.length; i++) {
    const sum = plusDIs[i] + minusDIs[i];
    dxArr.push(sum > 0 ? (Math.abs(plusDIs[i] - minusDIs[i]) / sum) * 100 : 0);
  }

  // Step 7: ADX = Wilder smooth of DX
  if (dxArr.length < p) {
    return { value: null, plusDI: null, minusDI: null, rising: null, label: 'INSUFFICIENT_DATA' };
  }

  // First ADX = average of first `p` DX values
  let adxSum = 0;
  for (let i = 0; i < p; i++) adxSum += dxArr[i];
  const adxValues = [adxSum / p];

  for (let i = p; i < dxArr.length; i++) {
    const prev = adxValues[adxValues.length - 1];
    adxValues.push((prev * (p - 1) + dxArr[i]) / p);
  }

  const adxValue = adxValues[adxValues.length - 1];
  const prevAdx  = adxValues.length >= 2 ? adxValues[adxValues.length - 2] : null;
  const rising   = prevAdx !== null ? adxValue > prevAdx : null;

  const lastPlusDI  = plusDIs[plusDIs.length - 1];
  const lastMinusDI = minusDIs[minusDIs.length - 1];

  // Labels
  const trendingMin = config.adxTrendingMin ?? 25;
  const rangingMax  = config.adxRangingMax  ?? 20;

  let label;
  if (adxValue >= 40)          label = 'STRONG_TREND';
  else if (adxValue >= trendingMin) label = 'TRENDING';
  else if (adxValue > rangingMax)   label = 'WEAK_TREND';
  else                              label = 'RANGING';

  return {
    value:   Math.round(adxValue * 100) / 100,
    plusDI:  Math.round(lastPlusDI * 100) / 100,
    minusDI: Math.round(lastMinusDI * 100) / 100,
    rising,
    label,
  };
}

module.exports = { calcADX };
