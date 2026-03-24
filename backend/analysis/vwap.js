'use strict';

/**
 * Calculate Volume-Weighted Average Price (VWAP) from OHLCV candles.
 *
 * Institutional S/R signal: price below VWAP = undervalued relative to
 * volume-weighted consensus. Manual computation — no npm dep.
 *
 * @param {object[]} candles — normalized OHLCV candles
 * @param {object}   [opts]  — { period }
 * @returns {{ vwapPrice: number|null, distance: number|null, label: string,
 *             bands: { upper: number|null, lower: number|null } }}
 */
function calcVWAP(candles, opts = {}) {
  const INSUFFICIENT = {
    vwapPrice: null, distance: null,
    label: 'INSUFFICIENT_DATA',
    bands: { upper: null, lower: null },
  };

  if (!candles || candles.length < 5) return INSUFFICIENT;

  const period = opts.period ?? 20;
  const lookback = Math.min(period, candles.length);
  const slice = candles.slice(-lookback);

  // Check for zero volume — can't compute VWAP without volume
  const totalVolume = slice.reduce((sum, c) => sum + (c.volume ?? 0), 0);
  if (totalVolume === 0) return INSUFFICIENT;

  // VWAP = sum(typical * volume) / sum(volume)
  let tpvSum = 0;
  let volSum = 0;
  let sqDevSum = 0;

  for (const c of slice) {
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume ?? 0;
    tpvSum += typical * vol;
    volSum += vol;
  }

  const vwapPrice = tpvSum / volSum;

  // Standard deviation bands (±1 std dev)
  for (const c of slice) {
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume ?? 0;
    sqDevSum += vol * Math.pow(typical - vwapPrice, 2);
  }

  const variance = sqDevSum / volSum;
  const stdDev = Math.sqrt(variance);

  const upper = vwapPrice + stdDev;
  const lower = vwapPrice - stdDev;

  // Distance from current price to VWAP (%)
  const currentPrice = candles[candles.length - 1].close;
  const distance = ((currentPrice - vwapPrice) / vwapPrice) * 100;

  // Label based on distance
  let label;
  if (Math.abs(distance) <= 1.0) {
    label = 'NEAR_VWAP';
  } else if (distance < -3.0) {
    label = 'BELOW_VWAP';          // significantly below — mean-reversion buy
  } else if (distance > 3.0) {
    label = 'ABOVE_VWAP';          // significantly above — extended
  } else if (distance < 0) {
    label = 'BELOW_VWAP';
  } else {
    label = 'ABOVE_VWAP';
  }

  return {
    vwapPrice: Math.round(vwapPrice * 1e8) / 1e8,
    distance:  Math.round(distance * 100) / 100,
    label,
    bands: {
      upper: Math.round(upper * 1e8) / 1e8,
      lower: Math.round(lower * 1e8) / 1e8,
    },
  };
}

module.exports = { calcVWAP };
