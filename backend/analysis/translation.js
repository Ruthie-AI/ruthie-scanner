'use strict';

/**
 * Right/Left Translation (Murphy Ch.14)
 *
 * Identifies whether the cycle peak occurs in the first half (left translation = bearish)
 * or second half (right translation = bullish) of the price cycle.
 *
 * @param {object[]} candles     — normalized OHLCV, oldest first
 * @param {object}   swingPoints — from calcSwingPoints()
 * @returns {{ translation: 'right'|'left'|'centered'|null, cyclePeakIndex: number|null,
 *             cycleMidpoint: number|null, confidence: number }}
 */
function detectTranslation(candles, swingPoints) {
  const defaults = { translation: null, cyclePeakIndex: null, cycleMidpoint: null, confidence: 0 };

  if (!candles || candles.length < 10 || !swingPoints) return defaults;

  const lows = swingPoints.swingLows || [];
  const highs = swingPoints.swingHighs || [];

  // Need at least 2 swing lows (cycle bounds) + 1 swing high (cycle peak)
  if (lows.length < 2 || highs.length < 1) return defaults;

  // Find the most recent complete cycle: low → high → low
  let cycleStart = null;
  let cycleEnd = null;
  let cyclePeak = null;

  // Work backwards to find the latest cycle
  for (let i = lows.length - 1; i >= 1; i--) {
    const startLow = lows[i - 1];
    const endLow = lows[i];

    // Find highest peak between these lows
    let bestPeak = null;
    for (const h of highs) {
      if (h.index > startLow.index && h.index < endLow.index) {
        if (!bestPeak || h.price > bestPeak.price) {
          bestPeak = h;
        }
      }
    }

    if (bestPeak) {
      cycleStart = startLow;
      cycleEnd = endLow;
      cyclePeak = bestPeak;
      break;
    }
  }

  if (!cycleStart || !cycleEnd || !cyclePeak) return defaults;

  const midpoint = (cycleStart.index + cycleEnd.index) / 2;
  const cycleLength = cycleEnd.index - cycleStart.index;

  if (cycleLength < 4) return defaults; // too short

  // Classify translation
  let translation;
  const peakPosition = (cyclePeak.index - cycleStart.index) / cycleLength;

  if (peakPosition > 0.55) {
    translation = 'right';  // bullish
  } else if (peakPosition < 0.45) {
    translation = 'left';   // bearish
  } else {
    translation = 'centered';
  }

  // Confidence based on cycle clarity
  let confidence = 40;
  if (cycleLength >= 8) confidence += 15;
  if (Math.abs(peakPosition - 0.5) > 0.2) confidence += 20;  // clear offset
  if (cyclePeak.price > cycleStart.price * 1.05) confidence += 15;  // meaningful peak

  return {
    translation,
    cyclePeakIndex: cyclePeak.index,
    cycleMidpoint: Math.round(midpoint * 10) / 10,
    confidence: Math.min(100, confidence),
  };
}

module.exports = { detectTranslation };
