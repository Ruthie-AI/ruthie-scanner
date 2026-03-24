'use strict';

const config     = require('../config');
const { ema }    = require('../utils/math');

/**
 * EMA Cross — detect fast/slow EMA crossovers.
 *
 * With 4 synthetic candles (h24, h6, h1, m5) the default periods are 2/3
 * so we always get a reading. Update emaFast/emaSlow in config when real
 * OHLCV candles are available from Birdeye (e.g. 9/21).
 *
 * Requires at least (emaSlow + 1) closes to detect a cross.
 * Returns INSUFFICIENT_DATA otherwise.
 *
 * @param {number[]} closes  — oldest first
 * @returns {{
 *   fastEma: number|null,
 *   slowEma: number|null,
 *   bullishCross: boolean,
 *   bearishCross: boolean,
 *   label: string
 * }}
 */
function calcEmaCross(closes) {
  const fastPeriod = config.emaFast;
  const slowPeriod = config.emaSlow;
  const minLen     = slowPeriod + 1; // need 2 slow EMA values for cross detection

  if (!closes || closes.length < minLen) {
    return {
      fastEma: null, slowEma: null,
      bullishCross: false, bearishCross: false,
      label: 'INSUFFICIENT_DATA',
    };
  }

  const fastEmas = ema(closes, fastPeriod);
  const slowEmas = ema(closes, slowPeriod);

  if (fastEmas.length < 2 || slowEmas.length < 2) {
    return {
      fastEma: null, slowEma: null,
      bullishCross: false, bearishCross: false,
      label: 'INSUFFICIENT_DATA',
    };
  }

  const fastNow  = fastEmas[fastEmas.length - 1];
  const fastPrev = fastEmas[fastEmas.length - 2];
  const slowNow  = slowEmas[slowEmas.length - 1];
  const slowPrev = slowEmas[slowEmas.length - 2];

  // Bullish cross: fast was at or below slow, now above
  const bullishCross = fastPrev <= slowPrev && fastNow > slowNow;
  // Bearish cross: fast was at or above slow, now below
  const bearishCross = fastPrev >= slowPrev && fastNow < slowNow;

  let label;
  if (bullishCross)       label = 'EMA_CROSS_UP';
  else if (bearishCross)  label = 'EMA_CROSS_DOWN';
  else if (fastNow > slowNow) label = 'EMA_BULLISH';
  else                        label = 'EMA_BEARISH';

  return {
    fastEma:      Math.round(fastNow * 1e8) / 1e8,
    slowEma:      Math.round(slowNow * 1e8) / 1e8,
    bullishCross,
    bearishCross,
    label,
  };
}

module.exports = { calcEmaCross };
