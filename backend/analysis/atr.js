'use strict';

const config = require('../config');
const { wilderSmooth, trueRange } = require('../utils/math');

/**
 * ATR — Average True Range (Wilder, Murphy Ch.15)
 *
 * Measures volatility as the smoothed average of True Range.
 * NOT a scoring signal — used for dynamic SL sizing and risk metadata.
 *
 * Algorithm:
 *   1. True Range for each bar (max of H-L, |H-prevC|, |L-prevC|)
 *   2. Wilder smooth TR over period
 *   3. Last smoothed value ÷ period = current ATR
 *   4. ATR% = ATR / last close price
 *
 * Labels (ATR as % of price):
 *   HIGH_VOL          — pct > 8%
 *   NORMAL            — 3–8%
 *   LOW_VOL           — pct < 3%
 *   INSUFFICIENT_DATA — not enough candles
 *
 * @param {object[]} candles   — normalized OHLCV, oldest first
 * @param {number}   [period]  — ATR period (default from config.adxPeriod, typically 14)
 * @returns {{
 *   value: number|null,   // Current ATR (absolute price units)
 *   pct: number|null,     // ATR as % of current price
 *   label: string
 * }}
 */
function calcATR(candles, period) {
  const p = period ?? config.adxPeriod ?? 14;
  const minCandles = p + 1; // need p bars of TR for Wilder smoothing

  if (!candles || candles.length < minCandles) {
    return { value: null, pct: null, label: 'INSUFFICIENT_DATA' };
  }

  const trArr = trueRange(candles);

  const smoothed = wilderSmooth(trArr, p);
  if (smoothed.length === 0) {
    return { value: null, pct: null, label: 'INSUFFICIENT_DATA' };
  }

  // Wilder smooth returns accumulated sums — divide by period for the average
  const atrValue = smoothed[smoothed.length - 1] / p;
  const lastClose = candles[candles.length - 1].close;
  const atrPct = lastClose > 0 ? atrValue / lastClose : null;

  let label;
  if (atrPct === null)    label = 'INSUFFICIENT_DATA';
  else if (atrPct > 0.08) label = 'HIGH_VOL';
  else if (atrPct < 0.03) label = 'LOW_VOL';
  else                     label = 'NORMAL';

  return {
    value: Math.round(atrValue * 1e10) / 1e10,  // high precision for micro-prices
    pct:   atrPct !== null ? Math.round(atrPct * 10000) / 10000 : null,  // 4 decimal places (0.0512 = 5.12%)
    label,
  };
}

module.exports = { calcATR };
