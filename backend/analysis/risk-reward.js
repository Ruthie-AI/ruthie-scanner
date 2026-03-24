'use strict';

/**
 * Risk:Reward Analysis (Murphy Ch.1)
 *
 * Calculates reward-to-risk ratio using nearest support/resistance from
 * swing points and Fibonacci levels. Used as a pure gate — not a scored signal.
 *
 * @param {object[]} candles     — normalized OHLCV, oldest first
 * @param {number}   entryPrice  — current/expected entry price
 * @param {object}   swingPoints — from calcSwingPoints()
 * @param {object}   fibonacci   — from calcFibonacci()
 * @returns {{ rrRatio: number|null, nearestSupport: number|null, nearestResistance: number|null,
 *             riskPct: number|null, rewardPct: number|null }}
 */
function calcRiskReward(candles, entryPrice, swingPoints, fibonacci) {
  if (!candles || candles.length < 4 || !entryPrice || entryPrice <= 0) {
    return { rrRatio: null, nearestSupport: null, nearestResistance: null, riskPct: null, rewardPct: null };
  }

  const supports = [];
  const resistances = [];

  // Swing-based levels (within last 40 candles — ~10h at 15m resolution)
  const startIdx = Math.max(0, candles.length - 40);
  if (swingPoints) {
    for (const sw of (swingPoints.swingLows || [])) {
      if (sw.index >= startIdx && sw.price < entryPrice) {
        supports.push({ price: sw.price, type: 'swing', strength: 2 });
      }
    }
    for (const sw of (swingPoints.swingHighs || [])) {
      if (sw.index >= startIdx && sw.price > entryPrice) {
        resistances.push({ price: sw.price, type: 'swing', strength: 2 });
      }
    }
  }

  // Fibonacci levels (within 15% for support, 30% for resistance — meme coin scale)
  if (fibonacci && fibonacci.levels && fibonacci.levels.length > 0) {
    for (const lvl of fibonacci.levels) {
      if (lvl.price < entryPrice) {
        const dist = (entryPrice - lvl.price) / entryPrice;
        if (dist <= 0.15) {
          supports.push({ price: lvl.price, type: 'fib', strength: lvl.ratio === 0.618 || lvl.ratio === 0.786 ? 3 : 1 });
        }
      } else if (lvl.price > entryPrice) {
        const dist = (lvl.price - entryPrice) / entryPrice;
        if (dist <= 0.30) {
          resistances.push({ price: lvl.price, type: 'fib', strength: lvl.ratio === 0.618 || lvl.ratio === 0.786 ? 3 : 1 });
        }
      }
    }
  }

  // Find nearest support (strongest if multiple)
  let nearestSupport = null;
  if (supports.length > 0) {
    supports.sort((a, b) => b.strength - a.strength || b.price - a.price); // strongest, then closest to entry
    nearestSupport = supports[0].price;
  }

  // Find nearest resistance (strongest if multiple)
  let nearestResistance = null;
  if (resistances.length > 0) {
    resistances.sort((a, b) => b.strength - a.strength || a.price - b.price); // strongest, then closest to entry
    nearestResistance = resistances[0].price;
  }

  // Can't compute R:R without both levels
  if (nearestSupport === null || nearestResistance === null) {
    return { rrRatio: null, nearestSupport, nearestResistance, riskPct: null, rewardPct: null };
  }

  const risk = entryPrice - nearestSupport;
  const reward = nearestResistance - entryPrice;

  if (risk <= 0) {
    return { rrRatio: null, nearestSupport, nearestResistance, riskPct: null, rewardPct: null };
  }

  const rrRatio = Math.round((reward / risk) * 100) / 100;
  const riskPct = Math.round((risk / entryPrice) * 10000) / 10000;
  const rewardPct = Math.round((reward / entryPrice) * 10000) / 10000;

  return { rrRatio, nearestSupport, nearestResistance, riskPct, rewardPct };
}

module.exports = { calcRiskReward };
