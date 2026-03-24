'use strict';

/**
 * Swing Point Detection (Murphy Ch.4 — Trend Definition)
 *
 * Murphy defines trend by the structure of price itself:
 *   - UPTREND:   successive higher peaks AND higher troughs
 *   - DOWNTREND: successive lower peaks AND lower troughs
 *   - SIDEWAYS:  peaks/troughs are flat or overlapping
 *
 * A swing high is a local maximum — its high is greater than the highs of
 * `lookback` candles on either side. A swing low is the mirror.
 *
 * This module is foundational infrastructure. It does NOT contribute a score
 * directly — downstream evaluators (divergence, patterns, S/R) consume its
 * output to produce scores.
 *
 * @param {object[]} candles  — normalized OHLCV, oldest first
 * @param {number}   [lookback=3] — candles on each side for local peak/trough
 * @returns {{
 *   swingHighs: { price: number, index: number, time: number }[],
 *   swingLows:  { price: number, index: number, time: number }[],
 *   trend: 'UP' | 'DOWN' | 'SIDEWAYS' | null,
 *   higherHighs: boolean|null,
 *   higherLows: boolean|null,
 *   label: string
 * }}
 */
function calcSwingPoints(candles, lookback = 3) {
  const minCandles = lookback * 2 + 1;

  if (!candles || candles.length < minCandles) {
    return {
      swingHighs: [], swingLows: [],
      trend: null, higherHighs: null, higherLows: null,
      label: 'INSUFFICIENT_DATA',
    };
  }

  const swingHighs = [];
  const swingLows  = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    // ── Swing high: candle[i].high > all neighbours in window ──
    let isHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) { isHigh = false; break; }
    }
    if (isHigh) {
      swingHighs.push({ price: candles[i].high, index: i, time: candles[i].time });
    }

    // ── Swing low: candle[i].low < all neighbours in window ──
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].low <= candles[i].low) { isLow = false; break; }
    }
    if (isLow) {
      swingLows.push({ price: candles[i].low, index: i, time: candles[i].time });
    }
  }

  // ── Trend classification (Murphy Ch.4) ──────────────────────────────────
  // Need at least 2 swing highs and 2 swing lows to classify
  const higherHighs = _isRising(swingHighs);
  const higherLows  = _isRising(swingLows);

  let trend = null;
  let label = 'INSUFFICIENT_SWINGS';

  if (higherHighs !== null && higherLows !== null) {
    if (higherHighs && higherLows) {
      trend = 'UP';
      label = 'TREND_UP';
    } else if (!higherHighs && !higherLows) {
      trend = 'DOWN';
      label = 'TREND_DOWN';
    } else {
      trend = 'SIDEWAYS';
      label = 'TREND_SIDEWAYS';
    }
  } else if (swingHighs.length > 0 || swingLows.length > 0) {
    label = 'INSUFFICIENT_SWINGS';
  }

  return {
    swingHighs,
    swingLows,
    trend,
    higherHighs,
    higherLows,
    label,
  };
}

/**
 * Check if the last two points in an array are rising.
 * Returns true if the most recent is higher, false if lower, null if < 2 points.
 */
function _isRising(points) {
  if (points.length < 2) return null;
  const prev = points[points.length - 2].price;
  const last = points[points.length - 1].price;
  return last > prev;
}

module.exports = { calcSwingPoints };
