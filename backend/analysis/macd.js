'use strict';

const { MACD } = require('technicalindicators');
const config   = require('../config');

/**
 * Calculate MACD(12,26,9) for a close price series.
 *
 * @param {number[]} closes  — oldest first
 * @returns {{
 *   macdLine: number|null,
 *   signalLine: number|null,
 *   histogram: number|null,
 *   bullishCross: boolean,
 *   bearishCross: boolean,
 *   label: string
 * }}
 */
function calcMACD(closes) {
  const minLen = config.macdSlow + config.macdSignal;

  if (!closes || closes.length < minLen) {
    return {
      macdLine: null, signalLine: null, histogram: null,
      bullishCross: false, bearishCross: false,
      label: 'INSUFFICIENT_DATA',
      _allResults: [],
    };
  }

  const results = MACD.calculate({
    values:             closes,
    fastPeriod:         config.macdFast,
    slowPeriod:         config.macdSlow,
    signalPeriod:       config.macdSignal,
    SimpleMAOscillator: false,
    SimpleMASignal:     false,
  });

  if (!results || results.length < 2) {
    return {
      macdLine: null, signalLine: null, histogram: null,
      bullishCross: false, bearishCross: false,
      label: 'INSUFFICIENT_DATA',
      _allResults: [],
    };
  }

  const latest = results[results.length - 1];
  const prev   = results[results.length - 2];

  const macdLine   = latest.MACD    ?? null;
  const signalLine = latest.signal  ?? null;
  const histogram  = latest.histogram ?? null;
  const prevHist   = prev.histogram ?? null;

  // Bullish cross: MACD line crosses above signal line
  const bullishCross =
    prev.MACD !== null && prev.signal !== null &&
    prev.MACD <= prev.signal &&
    macdLine  !== null && signalLine !== null &&
    macdLine  > signalLine;

  // Bearish cross: MACD line crosses below signal line
  const bearishCross =
    prev.MACD !== null && prev.signal !== null &&
    prev.MACD >= prev.signal &&
    macdLine  !== null && signalLine !== null &&
    macdLine  < signalLine;

  // Histogram turn: direction change precedes crossover (Murphy Ch.10 — leading indicator)
  const histogramTurnUp  = prevHist !== null && histogram !== null &&
    prevHist < 0 && histogram > prevHist;   // negative but rising → early bullish
  const histogramTurnDown = prevHist !== null && histogram !== null &&
    prevHist > 0 && histogram < prevHist;   // positive but falling → early bearish

  let label;
  if (bullishCross)                            label = 'BULL_CROSS';
  else if (bearishCross)                       label = 'BEAR_CROSS';
  else if (histogramTurnUp && macdLine < 0)    label = 'HIST_TURN_UP';
  else if (histogramTurnDown && macdLine > 0)  label = 'HIST_TURN_DOWN';
  else if (macdLine !== null && macdLine > 0)  label = 'BULLISH';
  else if (macdLine !== null && macdLine < 0)  label = 'BEARISH';
  else                                         label = 'NEUTRAL';

  return {
    macdLine:    macdLine   !== null ? Math.round(macdLine   * 1e8) / 1e8 : null,
    signalLine:  signalLine !== null ? Math.round(signalLine * 1e8) / 1e8 : null,
    histogram:   histogram  !== null ? Math.round(histogram  * 1e8) / 1e8 : null,
    bullishCross,
    bearishCross,
    histogramTurnUp,
    histogramTurnDown,
    label,
    _allResults: results,
  };
}

module.exports = { calcMACD };
