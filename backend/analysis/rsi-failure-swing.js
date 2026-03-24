'use strict';

const config = require('../config');

/**
 * RSI Failure Swings (Wilder — Murphy Ch.10)
 *
 * Wilder's highest-confidence oscillator signal. Pure price action on RSI,
 * no price divergence required.
 *
 * Bullish failure swing (4 steps):
 *   1. RSI drops below oversold (< 30)
 *   2. RSI bounces above 30
 *   3. RSI pulls back but stays above 30 (higher trough)
 *   4. RSI breaks above the prior bounce peak → confirmed buy
 *
 * Bearish failure swing (mirror):
 *   1. RSI rises above overbought (> 70)
 *   2. RSI drops below 70
 *   3. RSI rallies but stays below 70 (lower peak)
 *   4. RSI breaks below the prior drop trough → confirmed sell
 *
 * Scans last ~20 RSI values from rsi._allValues.
 *
 * Labels:
 *   RSI_BULL_FAIL_SWING — bullish failure swing confirmed
 *   RSI_BEAR_FAIL_SWING — bearish failure swing confirmed
 *   NONE                — no pattern detected
 *   INSUFFICIENT_DATA   — not enough RSI values
 *
 * @param {object} rsi — from calcRSI(), must have _allValues array
 * @returns {{ bullish: boolean, bearish: boolean, label: string }}
 */
function calcRsiFailureSwing(rsi) {
  if (!rsi || !rsi._allValues || rsi._allValues.length < 5) {
    return { bullish: false, bearish: false, label: 'INSUFFICIENT_DATA' };
  }

  const oversold   = config.rsiOversold ?? 30;
  const overbought = config.rsiOverbought ?? 70;

  // Scan last 20 values (or all if fewer)
  const values = rsi._allValues;
  const window = values.slice(-20);

  const bullish = _detectBullishFailSwing(window, oversold);
  const bearish = _detectBearishFailSwing(window, overbought);

  let label = 'NONE';
  if (bullish) label = 'RSI_BULL_FAIL_SWING';
  else if (bearish) label = 'RSI_BEAR_FAIL_SWING';

  return { bullish, bearish, label };
}

/**
 * Detect bullish failure swing in RSI values.
 *
 * State machine:
 *   WAITING      → RSI drops below oversold → GOT_OVERSOLD
 *   GOT_OVERSOLD → RSI bounces above oversold, record peak → GOT_BOUNCE
 *   GOT_BOUNCE   → RSI pulls back (stays above oversold), record trough → GOT_PULLBACK
 *   GOT_PULLBACK → RSI breaks above bounce peak → CONFIRMED
 */
function _detectBullishFailSwing(values, oversold) {
  let state = 'WAITING';
  let bouncePeak = -Infinity;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];

    switch (state) {
      case 'WAITING':
        if (v < oversold) state = 'GOT_OVERSOLD';
        break;

      case 'GOT_OVERSOLD':
        if (v >= oversold) {
          bouncePeak = v;
          state = 'GOT_BOUNCE';
        }
        break;

      case 'GOT_BOUNCE':
        if (v > bouncePeak) {
          // Still rising — update peak
          bouncePeak = v;
        } else if (v < bouncePeak && v >= oversold) {
          // Pullback that stays above oversold
          state = 'GOT_PULLBACK';
        } else if (v < oversold) {
          // Failed — dropped back below oversold, restart
          state = 'GOT_OVERSOLD';
        }
        break;

      case 'GOT_PULLBACK':
        if (v > bouncePeak) {
          return true; // Confirmed bullish failure swing
        } else if (v < oversold) {
          // Failed — restart
          state = 'GOT_OVERSOLD';
          bouncePeak = -Infinity;
        }
        break;
    }
  }

  return false;
}

/**
 * Detect bearish failure swing in RSI values.
 *
 * Mirror of bullish:
 *   WAITING      → RSI rises above overbought → GOT_OVERBOUGHT
 *   GOT_OVERBOUGHT → RSI drops below overbought, record trough → GOT_DROP
 *   GOT_DROP     → RSI rallies (stays below overbought), record peak → GOT_RALLY
 *   GOT_RALLY    → RSI breaks below drop trough → CONFIRMED
 */
function _detectBearishFailSwing(values, overbought) {
  let state = 'WAITING';
  let dropTrough = Infinity;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];

    switch (state) {
      case 'WAITING':
        if (v > overbought) state = 'GOT_OVERBOUGHT';
        break;

      case 'GOT_OVERBOUGHT':
        if (v <= overbought) {
          dropTrough = v;
          state = 'GOT_DROP';
        }
        break;

      case 'GOT_DROP':
        if (v < dropTrough) {
          // Still falling — update trough
          dropTrough = v;
        } else if (v > dropTrough && v <= overbought) {
          // Rally that stays below overbought
          state = 'GOT_RALLY';
        } else if (v > overbought) {
          // Failed — went back above overbought, restart
          state = 'GOT_OVERBOUGHT';
        }
        break;

      case 'GOT_RALLY':
        if (v < dropTrough) {
          return true; // Confirmed bearish failure swing
        } else if (v > overbought) {
          // Failed — restart
          state = 'GOT_OVERBOUGHT';
          dropTrough = Infinity;
        }
        break;
    }
  }

  return false;
}

module.exports = { calcRsiFailureSwing };
