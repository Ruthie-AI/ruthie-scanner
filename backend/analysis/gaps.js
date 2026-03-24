'use strict';

/**
 * Gap Detection (Murphy Ch.4)
 *
 * Identifies price gaps between candle close/open. While uncommon in 24/7 crypto,
 * liquidity gaps exist in meme coins. Classifies gaps as breakaway, runaway, or exhaustion.
 *
 * @param {object[]} candles — normalized OHLCV, oldest first
 * @returns {{ gaps: object[], recentGap: object|null }}
 */
function detectGaps(candles) {
  const empty = { gaps: [], recentGap: null };
  if (!candles || candles.length < 5) return empty;

  const gaps = [];

  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const currOpen = candles[i].open;

    if (prevClose <= 0) continue;

    const gapPct = (currOpen - prevClose) / prevClose;

    // Gap = open differs from previous close by >1%
    if (Math.abs(gapPct) < 0.01) continue;

    const direction = gapPct > 0 ? 'up' : 'down';
    const gapSize = Math.abs(gapPct);

    // Classify gap type
    const type = _classifyGap(candles, i, direction, gapSize);

    // Check if gap has been filled
    const filled = _isGapFilled(candles, i, prevClose, currOpen, direction);

    gaps.push({
      type,
      direction,
      gapSize: Math.round(gapSize * 10000) / 10000,
      filled,
      index: i,
    });
  }

  // Recent gap = most recent gap within last 3 candles
  let recentGap = null;
  for (let i = gaps.length - 1; i >= 0; i--) {
    if (candles.length - gaps[i].index <= 3) {
      recentGap = gaps[i];
      break;
    }
  }

  return { gaps, recentGap };
}

function _classifyGap(candles, gapIdx, direction, gapSize) {
  // Check context before the gap
  const lookback = Math.min(10, gapIdx);
  const priorCandles = candles.slice(gapIdx - lookback, gapIdx);

  // Measure prior range (consolidation indicator)
  const priorRange = priorCandles.length > 0
    ? (Math.max(...priorCandles.map(c => c.high)) - Math.min(...priorCandles.map(c => c.low))) /
      (priorCandles.reduce((s, c) => s + c.close, 0) / priorCandles.length)
    : 0;

  // Measure prior trend strength
  const priorMove = priorCandles.length >= 2
    ? (priorCandles[priorCandles.length - 1].close - priorCandles[0].close) / priorCandles[0].close
    : 0;

  // Check volume at gap
  const gapVol = candles[gapIdx].volume || 0;
  const avgVol = priorCandles.reduce((s, c) => s + (c.volume || 0), 0) / Math.max(1, priorCandles.length);
  const highVol = avgVol > 0 && gapVol > avgVol * 1.5;

  // Breakaway: gap after consolidation (low prior range)
  if (priorRange < 0.05) return 'breakaway';

  // Exhaustion: gap after extended move with high volume
  if (Math.abs(priorMove) > 0.10 && highVol) return 'exhaustion';

  // Runaway: gap in middle of established trend
  if (Math.abs(priorMove) > 0.05) return 'runaway';

  return 'breakaway'; // default
}

function _isGapFilled(candles, gapIdx, prevClose, currOpen, direction) {
  // Check if subsequent candles revisit the gap zone
  for (let i = gapIdx + 1; i < candles.length; i++) {
    if (direction === 'up') {
      // Gap up: filled when low drops to prevClose
      if (candles[i].low <= prevClose) return true;
    } else {
      // Gap down: filled when high reaches prevClose
      if (candles[i].high >= prevClose) return true;
    }
  }
  return false;
}

module.exports = { detectGaps };
