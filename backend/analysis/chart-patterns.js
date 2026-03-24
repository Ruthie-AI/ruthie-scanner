'use strict';

/**
 * Chart Pattern Detection (Murphy Ch.5-6)
 *
 * Detects reversal patterns (double top/bottom, head & shoulders) and
 * continuation patterns (flags, triangles, pennants) from swing points
 * and candle data.
 *
 * Edge metadata signal (weight 0) until data proves value.
 *
 * @param {object[]} candles          — normalized OHLCV, oldest first
 * @param {object}   swingPoints      — from calcSwingPoints()
 * @param {object}   supportResistance — from findLevels() (optional)
 * @param {number[]} [volumes]        — volume array (derived from candles if omitted)
 * @returns {{ patterns: object[] }}
 */
function detectPatterns(candles, swingPoints, supportResistance, volumes) {
  const patterns = [];

  if (!candles || candles.length < 10 || !swingPoints) {
    return { patterns };
  }

  const vols = volumes || candles.map(c => c.volume || 0);

  // ── Reversal patterns ──────────────────────────────────────────────────

  const dtResult = _detectDoubleTop(candles, swingPoints, vols);
  if (dtResult) patterns.push(dtResult);

  const dbResult = _detectDoubleBottom(candles, swingPoints, vols);
  if (dbResult) patterns.push(dbResult);

  const hsResult = _detectHeadAndShoulders(candles, swingPoints, vols);
  if (hsResult) patterns.push(hsResult);

  const ihsResult = _detectInverseHeadAndShoulders(candles, swingPoints, vols);
  if (ihsResult) patterns.push(ihsResult);

  // ── Continuation patterns ──────────────────────────────────────────────

  const flagResult = _detectFlag(candles, vols);
  if (flagResult) patterns.push(flagResult);

  const triResult = _detectTriangle(candles, swingPoints);
  if (triResult) patterns.push(triResult);

  const pennResult = _detectPennant(candles, swingPoints, vols);
  if (pennResult) patterns.push(pennResult);

  return { patterns };
}

// ── Double Top ────────────────────────────────────────────────────────────────

function _detectDoubleTop(candles, sp, vols) {
  const highs = sp.swingHighs || [];
  if (highs.length < 2) return null;

  // Check last two swing highs
  for (let i = highs.length - 1; i >= 1; i--) {
    const peak2 = highs[i];
    const peak1 = highs[i - 1];

    // Separated by 5-30 candles
    const gap = peak2.index - peak1.index;
    if (gap < 5 || gap > 30) continue;

    // Within 2% of each other
    const priceDiff = Math.abs(peak2.price - peak1.price) / Math.max(peak1.price, peak2.price);
    if (priceDiff > 0.02) continue;

    // Find neckline (low between the two peaks)
    let neckline = Infinity;
    for (let j = peak1.index + 1; j < peak2.index && j < candles.length; j++) {
      if (candles[j].low < neckline) neckline = candles[j].low;
    }
    if (neckline === Infinity) continue;

    // Volume: second peak should have lower volume (divergence)
    const vol1 = peak1.index < vols.length ? vols[peak1.index] : 0;
    const vol2 = peak2.index < vols.length ? vols[peak2.index] : 0;
    const volDivergence = vol2 < vol1;

    // Check if price has broken neckline (confirmed) or is forming
    const currentPrice = candles[candles.length - 1].close;
    const confirmed = currentPrice < neckline;

    const avgPeak = (peak1.price + peak2.price) / 2;
    const priceTarget = neckline - (avgPeak - neckline);

    // Confidence based on price similarity, volume divergence, neckline break
    let confidence = 40;
    if (priceDiff < 0.01) confidence += 15;
    if (volDivergence) confidence += 20;
    if (confirmed) confidence += 25;

    return {
      type: confirmed ? 'DOUBLE_TOP' : 'DOUBLE_TOP_FORMING',
      confidence: Math.min(100, confidence),
      priceTarget,
      direction: 'bearish',
      neckline,
      breakoutPrice: neckline,
    };
  }
  return null;
}

// ── Double Bottom ─────────────────────────────────────────────────────────────

function _detectDoubleBottom(candles, sp, vols) {
  const lows = sp.swingLows || [];
  if (lows.length < 2) return null;

  for (let i = lows.length - 1; i >= 1; i--) {
    const trough2 = lows[i];
    const trough1 = lows[i - 1];

    const gap = trough2.index - trough1.index;
    if (gap < 5 || gap > 30) continue;

    const priceDiff = Math.abs(trough2.price - trough1.price) / Math.min(trough1.price, trough2.price);
    if (priceDiff > 0.02) continue;

    // Neckline = high between the two troughs
    let neckline = -Infinity;
    for (let j = trough1.index + 1; j < trough2.index && j < candles.length; j++) {
      if (candles[j].high > neckline) neckline = candles[j].high;
    }
    if (neckline === -Infinity) continue;

    const vol1 = trough1.index < vols.length ? vols[trough1.index] : 0;
    const vol2 = trough2.index < vols.length ? vols[trough2.index] : 0;
    const volDivergence = vol2 < vol1;

    const currentPrice = candles[candles.length - 1].close;
    const confirmed = currentPrice > neckline;

    const avgTrough = (trough1.price + trough2.price) / 2;
    const priceTarget = neckline + (neckline - avgTrough);

    let confidence = 40;
    if (priceDiff < 0.01) confidence += 15;
    if (volDivergence) confidence += 20;
    if (confirmed) confidence += 25;

    return {
      type: confirmed ? 'DOUBLE_BOTTOM' : 'DOUBLE_BOTTOM_FORMING',
      confidence: Math.min(100, confidence),
      priceTarget,
      direction: 'bullish',
      neckline,
      breakoutPrice: neckline,
    };
  }
  return null;
}

// ── Head and Shoulders ────────────────────────────────────────────────────────

function _detectHeadAndShoulders(candles, sp, vols) {
  const highs = sp.swingHighs || [];
  if (highs.length < 3) return null;

  // Need 3 consecutive swing highs: left shoulder, head (highest), right shoulder
  for (let i = highs.length - 1; i >= 2; i--) {
    const rs = highs[i];       // right shoulder
    const head = highs[i - 1]; // head
    const ls = highs[i - 2];   // left shoulder

    // Head must be highest
    if (head.price <= ls.price || head.price <= rs.price) continue;

    // Head must be >3% above both shoulders
    if ((head.price - ls.price) / head.price < 0.03) continue;
    if ((head.price - rs.price) / head.price < 0.03) continue;

    // Shoulders within 5% of each other
    const shoulderDiff = Math.abs(rs.price - ls.price) / Math.max(rs.price, ls.price);
    if (shoulderDiff > 0.05) continue;

    // Find neckline (connect troughs between L-H and H-R)
    let trough1 = Infinity, trough2 = Infinity;
    for (let j = ls.index + 1; j < head.index && j < candles.length; j++) {
      if (candles[j].low < trough1) trough1 = candles[j].low;
    }
    for (let j = head.index + 1; j < rs.index && j < candles.length; j++) {
      if (candles[j].low < trough2) trough2 = candles[j].low;
    }
    if (trough1 === Infinity || trough2 === Infinity) continue;

    const neckline = (trough1 + trough2) / 2;
    const currentPrice = candles[candles.length - 1].close;
    const confirmed = currentPrice < neckline;

    const priceTarget = neckline - (head.price - neckline);

    // Volume: typically decreasing across peaks
    const volLS = ls.index < vols.length ? vols[ls.index] : 0;
    const volHead = head.index < vols.length ? vols[head.index] : 0;
    const volDeclining = volHead < volLS;

    let confidence = 35;
    if (shoulderDiff < 0.02) confidence += 15;
    if (volDeclining) confidence += 15;
    if (confirmed) confidence += 25;
    if ((head.price - neckline) / neckline > 0.05) confidence += 10;

    return {
      type: confirmed ? 'HEAD_AND_SHOULDERS' : 'HEAD_AND_SHOULDERS_FORMING',
      confidence: Math.min(100, confidence),
      priceTarget,
      direction: 'bearish',
      neckline,
      breakoutPrice: neckline,
    };
  }
  return null;
}

// ── Inverse Head and Shoulders ────────────────────────────────────────────────

function _detectInverseHeadAndShoulders(candles, sp, vols) {
  const lows = sp.swingLows || [];
  if (lows.length < 3) return null;

  for (let i = lows.length - 1; i >= 2; i--) {
    const rs = lows[i];
    const head = lows[i - 1];
    const ls = lows[i - 2];

    // Head must be lowest
    if (head.price >= ls.price || head.price >= rs.price) continue;

    // Head must be >3% below both shoulders
    if ((ls.price - head.price) / ls.price < 0.03) continue;
    if ((rs.price - head.price) / rs.price < 0.03) continue;

    // Shoulders within 5%
    const shoulderDiff = Math.abs(rs.price - ls.price) / Math.max(rs.price, ls.price);
    if (shoulderDiff > 0.05) continue;

    // Find neckline from peaks between troughs
    let peak1 = -Infinity, peak2 = -Infinity;
    for (let j = ls.index + 1; j < head.index && j < candles.length; j++) {
      if (candles[j].high > peak1) peak1 = candles[j].high;
    }
    for (let j = head.index + 1; j < rs.index && j < candles.length; j++) {
      if (candles[j].high > peak2) peak2 = candles[j].high;
    }
    if (peak1 === -Infinity || peak2 === -Infinity) continue;

    const neckline = (peak1 + peak2) / 2;
    const currentPrice = candles[candles.length - 1].close;
    const confirmed = currentPrice > neckline;

    const priceTarget = neckline + (neckline - head.price);

    let confidence = 35;
    if (shoulderDiff < 0.02) confidence += 15;
    if (confirmed) confidence += 25;
    if ((neckline - head.price) / neckline > 0.05) confidence += 10;

    return {
      type: confirmed ? 'INVERSE_HEAD_AND_SHOULDERS' : 'INVERSE_HEAD_AND_SHOULDERS_FORMING',
      confidence: Math.min(100, confidence),
      priceTarget,
      direction: 'bullish',
      neckline,
      breakoutPrice: neckline,
    };
  }
  return null;
}

// ── Flag (continuation) ───────────────────────────────────────────────────────

function _detectFlag(candles, vols) {
  if (candles.length < 15) return null;

  // Look for impulse move >5% in <5 candles (the "pole"), followed by consolidation
  for (let start = candles.length - 15; start >= Math.max(0, candles.length - 25); start--) {
    // Check for bullish pole
    for (let poleEnd = start + 2; poleEnd <= start + 5 && poleEnd < candles.length; poleEnd++) {
      const poleMove = (candles[poleEnd].close - candles[start].close) / candles[start].close;

      if (Math.abs(poleMove) < 0.05) continue;

      const isBull = poleMove > 0;
      const flagStart = poleEnd;
      const flagEnd = Math.min(candles.length - 1, flagStart + 15);
      const flagLen = flagEnd - flagStart;
      if (flagLen < 3) continue;

      // Check consolidation: tighter range, decreasing volume
      const flagCandles = candles.slice(flagStart, flagEnd + 1);
      const flagRange = Math.max(...flagCandles.map(c => c.high)) - Math.min(...flagCandles.map(c => c.low));
      const poleRange = Math.abs(candles[poleEnd].close - candles[start].close);

      // Flag should be compact (range < 50% of pole)
      if (flagRange > poleRange * 0.5) continue;

      // Volume should decrease in flag
      const poleVol = vols.slice(start, poleEnd + 1).reduce((s, v) => s + v, 0) / (poleEnd - start + 1);
      const flagVol = vols.slice(flagStart, flagEnd + 1).reduce((s, v) => s + v, 0) / (flagLen + 1);
      const volDecreasing = flagVol < poleVol;

      let confidence = 40;
      if (Math.abs(poleMove) > 0.10) confidence += 15;
      if (volDecreasing) confidence += 15;
      if (flagLen >= 5 && flagLen <= 15) confidence += 10;

      const priceTarget = isBull
        ? candles[flagEnd].close + poleRange
        : candles[flagEnd].close - poleRange;

      return {
        type: isBull ? 'BULL_FLAG' : 'BEAR_FLAG',
        confidence: Math.min(100, confidence),
        priceTarget,
        direction: isBull ? 'bullish' : 'bearish',
        neckline: null,
        breakoutPrice: isBull ? Math.max(...flagCandles.map(c => c.high)) : Math.min(...flagCandles.map(c => c.low)),
      };
    }
  }
  return null;
}

// ── Triangle (ascending/descending) ──────────────────────────────────────────

function _detectTriangle(candles, sp) {
  const highs = sp.swingHighs || [];
  const lows = sp.swingLows || [];

  if (highs.length < 3 || lows.length < 2) return null;

  // Check last 3 swing highs for flat resistance + rising support
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);

  if (recentLows.length < 2) return null;

  // Flat resistance: 3+ highs within 1% of each other
  const maxH = Math.max(...recentHighs.map(h => h.price));
  const minH = Math.min(...recentHighs.map(h => h.price));
  const flatResistance = (maxH - minH) / maxH < 0.01;

  // Rising support: higher lows
  const risingSupport = recentLows.length >= 2 &&
    recentLows[recentLows.length - 1].price > recentLows[recentLows.length - 2].price;

  // Descending triangle: flat support + falling highs
  const flatSupport = recentLows.length >= 2 &&
    Math.abs(recentLows[recentLows.length - 1].price - recentLows[recentLows.length - 2].price) / recentLows[0].price < 0.01;
  const fallingResistance = recentHighs.length >= 2 &&
    recentHighs[recentHighs.length - 1].price < recentHighs[recentHighs.length - 2].price;

  // Ascending triangle
  if (flatResistance && risingSupport) {
    const span = recentHighs[recentHighs.length - 1].index - recentHighs[0].index;
    if (span < 10) return null;

    const resistance = maxH;
    const height = resistance - recentLows[recentLows.length - 1].price;
    const currentPrice = candles[candles.length - 1].close;
    const confirmed = currentPrice > resistance;

    let confidence = 45;
    if (recentHighs.length >= 3) confidence += 10;
    if (confirmed) confidence += 25;

    return {
      type: 'ASCENDING_TRIANGLE',
      confidence: Math.min(100, confidence),
      priceTarget: resistance + height,
      direction: 'bullish',
      neckline: resistance,
      breakoutPrice: resistance,
    };
  }

  // Descending triangle
  if (flatSupport && fallingResistance) {
    const support = Math.min(...recentLows.map(l => l.price));
    const height = recentHighs[0].price - support;
    const currentPrice = candles[candles.length - 1].close;
    const confirmed = currentPrice < support;

    let confidence = 45;
    if (recentLows.length >= 3) confidence += 10;
    if (confirmed) confidence += 25;

    return {
      type: 'DESCENDING_TRIANGLE',
      confidence: Math.min(100, confidence),
      priceTarget: support - height,
      direction: 'bearish',
      neckline: support,
      breakoutPrice: support,
    };
  }

  return null;
}

// ── Pennant ───────────────────────────────────────────────────────────────────

function _detectPennant(candles, sp, vols) {
  if (candles.length < 10) return null;

  const highs = sp.swingHighs || [];
  const lows = sp.swingLows || [];

  // Need converging trendlines after an impulse
  if (highs.length < 2 || lows.length < 2) return null;

  const lastHighs = highs.slice(-2);
  const lastLows = lows.slice(-2);

  // Converging: highs falling, lows rising
  const convergingHighs = lastHighs[1].price < lastHighs[0].price;
  const convergingLows = lastLows[1].price > lastLows[0].price;

  if (!convergingHighs || !convergingLows) return null;

  // Short duration (5-10 candles for the pennant portion)
  const pennantSpan = lastHighs[1].index - lastLows[0].index;
  if (pennantSpan < 3 || pennantSpan > 15) return null;

  // Check for preceding impulse move
  const pennantStart = Math.min(lastHighs[0].index, lastLows[0].index);
  if (pennantStart < 3) return null;

  const preMove = (candles[pennantStart].close - candles[Math.max(0, pennantStart - 5)].close) / candles[Math.max(0, pennantStart - 5)].close;
  const isBull = preMove > 0.03;
  const isBear = preMove < -0.03;

  if (!isBull && !isBear) return null;

  // Volume should decrease
  const earlyVol = vols.slice(Math.max(0, pennantStart - 5), pennantStart).reduce((s, v) => s + v, 0);
  const pennantVol = vols.slice(pennantStart, Math.min(vols.length, pennantStart + pennantSpan)).reduce((s, v) => s + v, 0);
  const volDecreasing = pennantSpan > 0 && (pennantVol / pennantSpan) < (earlyVol / 5);

  const poleLength = Math.abs(candles[pennantStart].close - candles[Math.max(0, pennantStart - 5)].close);
  const currentPrice = candles[candles.length - 1].close;

  let confidence = 40;
  if (volDecreasing) confidence += 15;
  if (pennantSpan >= 5 && pennantSpan <= 10) confidence += 10;

  return {
    type: isBull ? 'PENNANT_BULL' : 'PENNANT_BEAR',
    confidence: Math.min(100, confidence),
    priceTarget: isBull ? currentPrice + poleLength : currentPrice - poleLength,
    direction: isBull ? 'bullish' : 'bearish',
    neckline: null,
    breakoutPrice: isBull ? lastHighs[1].price : lastLows[1].price,
  };
}

module.exports = { detectPatterns };
