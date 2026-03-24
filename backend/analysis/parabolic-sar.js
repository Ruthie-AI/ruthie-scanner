'use strict';

/**
 * Parabolic SAR (Murphy Ch.15 — Wilder)
 *
 * Dynamic trailing stop that accelerates as the trade progresses.
 * NOT an entry signal — used as an optional SL floor in exit intelligence.
 *
 * @param {object[]} candles — normalized OHLCV, oldest first
 * @param {number}   [af=0.02]    — initial acceleration factor
 * @param {number}   [maxAf=0.20] — maximum acceleration factor
 * @returns {{ sar: number[], currentSar: number|null, trend: 'up'|'down'|null, af: number, isFlipping: boolean }}
 */
function calcSAR(candles, af = 0.02, maxAf = 0.20) {
  if (!candles || candles.length < 3) {
    return { sar: [], currentSar: null, trend: null, af, isFlipping: false };
  }

  const len = candles.length;
  const sarValues = new Array(len).fill(0);

  // Initialize: determine initial trend from first two candles
  let isUpTrend = candles[1].close > candles[0].close;
  let currentAf = af;
  let ep = isUpTrend ? candles[0].high : candles[0].low; // extreme point
  sarValues[0] = isUpTrend ? candles[0].low : candles[0].high;

  if (isUpTrend) {
    sarValues[1] = Math.min(candles[0].low, candles[1].low);
    ep = Math.max(candles[0].high, candles[1].high);
  } else {
    sarValues[1] = Math.max(candles[0].high, candles[1].high);
    ep = Math.min(candles[0].low, candles[1].low);
  }

  let prevIsFlipping = false;

  for (let i = 2; i < len; i++) {
    const prevSar = sarValues[i - 1];
    prevIsFlipping = false;

    // Calculate new SAR
    let newSar = prevSar + currentAf * (ep - prevSar);

    if (isUpTrend) {
      // SAR must not be above the prior two lows
      newSar = Math.min(newSar, candles[i - 1].low, candles[i - 2].low);

      // Check for reversal
      if (candles[i].low < newSar) {
        // Flip to downtrend
        isUpTrend = false;
        newSar = ep; // SAR = previous extreme point
        ep = candles[i].low;
        currentAf = af;
        prevIsFlipping = true;
      } else {
        // Update extreme point
        if (candles[i].high > ep) {
          ep = candles[i].high;
          currentAf = Math.min(currentAf + af, maxAf);
        }
      }
    } else {
      // SAR must not be below the prior two highs
      newSar = Math.max(newSar, candles[i - 1].high, candles[i - 2].high);

      // Check for reversal
      if (candles[i].high > newSar) {
        // Flip to uptrend
        isUpTrend = true;
        newSar = ep;
        ep = candles[i].high;
        currentAf = af;
        prevIsFlipping = true;
      } else {
        if (candles[i].low < ep) {
          ep = candles[i].low;
          currentAf = Math.min(currentAf + af, maxAf);
        }
      }
    }

    sarValues[i] = Math.round(newSar * 1e10) / 1e10;
  }

  return {
    sar: sarValues,
    currentSar: sarValues[len - 1],
    trend: isUpTrend ? 'up' : 'down',
    af: currentAf,
    isFlipping: prevIsFlipping,
  };
}

module.exports = { calcSAR };
