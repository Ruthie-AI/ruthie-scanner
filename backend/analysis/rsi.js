'use strict';

const { RSI } = require('technicalindicators');
const config  = require('../config');

/**
 * Calculate RSI-14 for a series of close prices.
 *
 * @param {number[]} closes  — array of close prices, oldest first
 * @returns {{ value: number|null, label: string }}
 *   value: latest RSI (0–100), or null if insufficient data
 *   label: 'OVERSOLD' | 'OVERBOUGHT' | 'NEUTRAL' | 'INSUFFICIENT_DATA'
 */
function calcRSI(closes) {
  const period = config.rsiPeriod;

  if (!closes || closes.length < period + 1) {
    return { value: null, label: 'INSUFFICIENT_DATA', _allValues: [] };
  }

  const values = RSI.calculate({ values: closes, period });
  if (!values || values.length === 0) {
    return { value: null, label: 'INSUFFICIENT_DATA', _allValues: [] };
  }

  const latest = values[values.length - 1];

  let label;
  if (latest <= config.rsiOversold) {
    label = 'OVERSOLD';
  } else if (latest <= config.rsiNeutralLow) {
    label = 'NEAR_OVERSOLD';
  } else if (latest >= config.rsiOverbought) {
    label = 'OVERBOUGHT';
  } else {
    label = 'NEUTRAL';
  }

  return { value: Math.round(latest * 10) / 10, label, _allValues: values };
}

module.exports = { calcRSI };
