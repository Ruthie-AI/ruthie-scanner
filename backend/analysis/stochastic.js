'use strict';

const { Stochastic } = require('technicalindicators');

/**
 * Calculate Stochastic Oscillator (%K / %D) from OHLCV candles.
 *
 * Mean-reversion signal: %K/%D crossovers in oversold/overbought zones
 * indicate potential reversals. Complements trend-following signals.
 *
 * @param {object[]} candles — normalized OHLCV candles
 * @param {object}   [opts]  — { period, signalPeriod, smoothing }
 * @returns {{ kLine: number|null, dLine: number|null, bullishCross: boolean,
 *             bearishCross: boolean, label: string }}
 */
function calcStochastic(candles, opts = {}) {
  const INSUFFICIENT = {
    kLine: null, dLine: null,
    bullishCross: false, bearishCross: false,
    label: 'INSUFFICIENT_DATA',
  };

  if (!candles || candles.length < 2) return INSUFFICIENT;

  const period       = opts.period       ?? 14;
  const signalPeriod = opts.signalPeriod ?? 3;
  const smoothing    = opts.smoothing    ?? 1;

  // Need at least period + signalPeriod candles for meaningful output
  if (candles.length < period + signalPeriod) return INSUFFICIENT;

  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const closes = candles.map(c => c.close);

  const result = Stochastic.calculate({
    high:   highs,
    low:    lows,
    close:  closes,
    period,
    signalPeriod,
  });

  if (!result || result.length < 2) return INSUFFICIENT;

  const current  = result[result.length - 1];
  const previous = result[result.length - 2];

  if (current.k == null || current.d == null) return INSUFFICIENT;

  const kLine = current.k;
  const dLine = current.d;

  // Crossover detection: %K crosses %D
  const bullishCross = previous.k <= previous.d && kLine > dLine;
  const bearishCross = previous.k >= previous.d && kLine < dLine;

  // Label assignment
  let label;
  if (bullishCross && kLine < 30) {
    label = 'BULLISH_CROSS';    // cross in oversold zone — strongest
  } else if (bearishCross && kLine > 70) {
    label = 'BEARISH_CROSS';    // cross in overbought zone — strongest
  } else if (kLine <= 20) {
    label = 'OVERSOLD';
  } else if (kLine >= 80) {
    label = 'OVERBOUGHT';
  } else if (bullishCross) {
    label = 'BULLISH_CROSS';
  } else if (bearishCross) {
    label = 'BEARISH_CROSS';
  } else {
    label = 'NEUTRAL';
  }

  return {
    kLine:  Math.round(kLine * 100) / 100,
    dLine:  Math.round(dLine * 100) / 100,
    bullishCross,
    bearishCross,
    label,
  };
}

module.exports = { calcStochastic };
