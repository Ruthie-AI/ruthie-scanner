'use strict';

const { sma } = require('../utils/math');

/**
 * Volume Climax Detection (Murphy Ch.7)
 *
 * Extreme volume events that signal exhaustion or capitulation.
 * Buying climax: extreme volume + large green candle at recent high (exhaustion top).
 * Selling climax: extreme volume + large red candle at recent low (capitulation bottom).
 *
 * @param {object[]} candles — normalized OHLCV, oldest first
 * @returns {{ isClimax: boolean, type: 'buying'|'selling'|null, intensity: number, volumeRatio: number|null }}
 */
function detectClimax(candles) {
  const defaults = { isClimax: false, type: null, intensity: 0, volumeRatio: null };

  if (!candles || candles.length < 21) return defaults;

  const volumes = candles.map(c => c.volume || 0);
  const volSma = sma(volumes, 20);
  if (!volSma || volSma.length === 0) return defaults;

  const avgVol = volSma[volSma.length - 1];
  if (avgVol <= 0) return defaults;

  const lastCandle = candles[candles.length - 1];
  const lastVol = lastCandle.volume || 0;
  const volumeRatio = lastVol / avgVol;

  // Climax = volume > 2× 20-period SMA (lowered from 3× for 15m meme coin candles)
  if (volumeRatio < 2) {
    return { ...defaults, volumeRatio: Math.round(volumeRatio * 100) / 100 };
  }

  // Determine candle direction
  const body = lastCandle.close - lastCandle.open;
  const bodyPct = Math.abs(body) / lastCandle.open;
  const isGreen = body > 0;

  // Check if at recent high or low (last 20 candles)
  const recentHighs = candles.slice(-20).map(c => c.high);
  const recentLows = candles.slice(-20).map(c => c.low);
  const maxHigh = Math.max(...recentHighs);
  const minLow = Math.min(...recentLows);

  const nearHigh = lastCandle.high >= maxHigh * 0.98;
  const nearLow = lastCandle.low <= minLow * 1.02;

  // Intensity: 2× = 1, 4× = 2, 6× = 3 (adjusted for meme coin volatility)
  let intensity = 0;
  if (volumeRatio >= 6) intensity = 3;
  else if (volumeRatio >= 4) intensity = 2;
  else intensity = 1;

  let type = null;

  // Buying climax: high volume + green candle at recent high (bodyPct lowered for 15m candles)
  if (isGreen && nearHigh && bodyPct > 0.01) {
    type = 'buying';
  }
  // Selling climax: high volume + red candle at recent low
  else if (!isGreen && nearLow && bodyPct > 0.01) {
    type = 'selling';
  }

  return {
    isClimax: type !== null,
    type,
    intensity,
    volumeRatio: Math.round(volumeRatio * 100) / 100,
  };
}

module.exports = { detectClimax };
