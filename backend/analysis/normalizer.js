'use strict';

/**
 * Normalize raw candle data from any source into a standard OHLCV format.
 *
 * Standard candle shape:
 * { time: number (unix ms), open: number, high: number, low: number, close: number, volume: number }
 */

/**
 * Convert DexScreener-style synthetic candles (already in standard format)
 * or Birdeye-style candles into the standard shape.
 *
 * @param {object[]} rawCandles
 * @returns {object[]}  sorted ascending by time
 */
function toOHLCV(rawCandles) {
  if (!Array.isArray(rawCandles) || rawCandles.length === 0) return [];

  return rawCandles
    .map(c => {
      // Support Birdeye format { unixTime, o, h, l, c, v }
      const time   = c.time   ?? (c.unixTime ? c.unixTime * 1000 : null);
      const open   = parseFloat(c.open  ?? c.o ?? 0);
      const high   = parseFloat(c.high  ?? c.h ?? 0);
      const low    = parseFloat(c.low   ?? c.l ?? 0);
      const close  = parseFloat(c.close ?? c.c ?? 0);
      const volume = parseFloat(c.volume ?? c.v ?? 0);

      if (!time || !isFinite(close) || close <= 0) return null;
      return { time, open, high, low, close, volume };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

/**
 * Extract close prices from normalized candles.
 * @param {object[]} candles
 * @returns {number[]}
 */
function closes(candles) {
  return candles.map(c => c.close);
}

module.exports = { toOHLCV, closes };
