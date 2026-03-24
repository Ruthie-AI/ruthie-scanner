'use strict';

/**
 * Calculate Ichimoku Cloud from OHLCV candles.
 *
 * Multi-TF trend signal: cloud color (bullish/bearish), price vs cloud,
 * and TK cross provide trend confirmation. Manual computation — no npm dep.
 *
 * Periods: conversion=9, base=26, leading=52 (standard Ichimoku settings).
 * Needs 52 candles minimum for full computation.
 *
 * @param {object[]} candles — normalized OHLCV candles
 * @param {object}   [opts]  — { conversionPeriod, basePeriod, leadingPeriod }
 * @returns {{ conversionLine: number|null, baseLine: number|null,
 *             leadingA: number|null, leadingB: number|null,
 *             cloudColor: string|null, priceVsCloud: string|null, label: string }}
 */
function calcIchimoku(candles, opts = {}) {
  const INSUFFICIENT = {
    conversionLine: null, baseLine: null,
    leadingA: null, leadingB: null,
    cloudColor: null, priceVsCloud: null,
    label: 'INSUFFICIENT_DATA',
  };

  if (!candles || candles.length < 2) return INSUFFICIENT;

  const conversionPeriod = opts.conversionPeriod ?? 9;
  const basePeriod       = opts.basePeriod       ?? 26;
  const leadingPeriod    = opts.leadingPeriod     ?? 52;

  // Need at least leadingPeriod candles for a meaningful cloud
  if (candles.length < leadingPeriod) return INSUFFICIENT;

  /**
   * Mid-point of highest high and lowest low over N periods ending at index i.
   */
  function midpoint(endIdx, period) {
    const start = Math.max(0, endIdx - period + 1);
    let high = -Infinity;
    let low  = Infinity;
    for (let j = start; j <= endIdx; j++) {
      if (candles[j].high > high) high = candles[j].high;
      if (candles[j].low < low)   low  = candles[j].low;
    }
    return (high + low) / 2;
  }

  const lastIdx = candles.length - 1;

  // Tenkan-sen (Conversion Line): mid of 9-period high/low
  const conversionLine = midpoint(lastIdx, conversionPeriod);

  // Kijun-sen (Base Line): mid of 26-period high/low
  const baseLine = midpoint(lastIdx, basePeriod);

  // Senkou Span A (Leading Span A): average of conversion + base, projected 26 ahead
  // We compute current value (would be the cloud edge 26 periods ahead)
  const leadingA = (conversionLine + baseLine) / 2;

  // Senkou Span B (Leading Span B): mid of 52-period high/low, projected 26 ahead
  const leadingB = midpoint(lastIdx, leadingPeriod);

  // Cloud color
  const cloudColor = leadingA >= leadingB ? 'green' : 'red';

  // Current price vs current cloud
  const currentPrice = candles[lastIdx].close;
  const cloudTop    = Math.max(leadingA, leadingB);
  const cloudBottom = Math.min(leadingA, leadingB);

  let priceVsCloud;
  if (currentPrice > cloudTop) {
    priceVsCloud = 'above';
  } else if (currentPrice < cloudBottom) {
    priceVsCloud = 'below';
  } else {
    priceVsCloud = 'inside';
  }

  // TK cross (Tenkan/Kijun) — compute previous values for cross detection
  let tkBullishCross = false;
  let tkBearishCross = false;
  if (lastIdx >= 1) {
    const prevConversion = midpoint(lastIdx - 1, conversionPeriod);
    const prevBase       = midpoint(lastIdx - 1, basePeriod);
    tkBullishCross = prevConversion <= prevBase && conversionLine > baseLine;
    tkBearishCross = prevConversion >= prevBase && conversionLine < baseLine;
  }

  // Label
  let label;
  if (cloudColor === 'green' && priceVsCloud === 'above') {
    label = tkBullishCross ? 'BULLISH_SIGNAL' : 'BULLISH_SIGNAL';
  } else if (cloudColor === 'red' && priceVsCloud === 'below') {
    label = tkBearishCross ? 'BEARISH_SIGNAL' : 'BEARISH_SIGNAL';
  } else if (priceVsCloud === 'inside') {
    label = 'NEUTRAL';
  } else if (cloudColor === 'green' && priceVsCloud === 'below') {
    // Transition zone — cloud is bullish but price hasn't caught up
    label = 'NEUTRAL';
  } else if (cloudColor === 'red' && priceVsCloud === 'above') {
    // Transition zone — cloud is bearish but price hasn't dropped yet
    label = 'NEUTRAL';
  } else {
    label = 'NEUTRAL';
  }

  return {
    conversionLine: Math.round(conversionLine * 1e8) / 1e8,
    baseLine:       Math.round(baseLine * 1e8) / 1e8,
    leadingA:       Math.round(leadingA * 1e8) / 1e8,
    leadingB:       Math.round(leadingB * 1e8) / 1e8,
    cloudColor,
    priceVsCloud,
    tkBullishCross,
    tkBearishCross,
    label,
  };
}

module.exports = { calcIchimoku };
