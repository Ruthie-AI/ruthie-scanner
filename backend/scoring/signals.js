'use strict';

const config = require('../config');
const { clamp } = require('../utils/math');

/**
 * Each evaluator returns:
 * { score: 0-100, label: string, weight: number } | null
 * Returning null removes the signal from composite (weight re-normalized).
 */

/**
 * RSI signal — oversold = high score, overbought = low score.
 */
function evalRSI(rsi) {
  if (!rsi || rsi.value === null) return null;

  const { value } = rsi;
  let score;

  if (value <= config.rsiOversold) {
    score = 100;
  } else if (value <= config.rsiNeutralLow) {
    score = 100 - ((value - config.rsiOversold) / (config.rsiNeutralLow - config.rsiOversold)) * 40;
  } else if (value < config.rsiOverbought) {
    score = 60 - ((value - config.rsiNeutralLow) / (config.rsiOverbought - config.rsiNeutralLow)) * 40;
  } else {
    score = Math.max(0, 10 - (value - config.rsiOverbought));
  }

  return { name: 'rsi', score: clamp(Math.round(score), 0, 100), label: rsi.label, weight: config.weights.rsi };
}

/**
 * MACD signal — bullish cross or above-zero = higher score.
 */
function evalMACD(macd) {
  if (!macd || macd.macdLine === null) return null;

  let score;
  if (macd.bullishCross)            score = 100;
  else if (macd.histogramTurnUp)    score = 80;
  else if (macd.macdLine > 0)       score = 65;
  else if (macd.histogramTurnDown)  score = 15;
  else if (macd.bearishCross)       score = 5;
  else                              score = 20;

  return { name: 'macd', score, label: macd.label, weight: config.weights.macd };
}

/**
 * Fibonacci signal — at key levels (0.618/0.786) = high score.
 */
function evalFibonacci(fibonacci) {
  if (!fibonacci || fibonacci.swingHigh === null) return null;

  let score;
  let label = fibonacci.label;
  if (fibonacci.label === 'INSUFFICIENT_DATA' || fibonacci.label === 'FLAT') return null;

  if (fibonacci.retracementDepth === 'normal' && fibonacci.atFibLevel) {
    score = 80;
    label = 'GOLDEN_ZONE';
  } else if (fibonacci.retracementDepth === 'shallow') {
    score = 65;
    label = 'SHALLOW_RETRACEMENT';
  } else if (fibonacci.retracementDepth === 'deep') {
    score = 45;
    label = 'DEEP_RETRACEMENT';
  } else if (fibonacci.atHighValueLevel) {
    score = 100;
  } else if (fibonacci.atFibLevel) {
    score = 70;
  } else if (fibonacci.label === 'NEAR_FIB') {
    score = 40;
  } else {
    score = 20;
  }

  return { name: 'fibonacci', score, label, weight: config.weights.fibonacci };
}

/**
 * DexScreener trending rank signal with time-based decay.
 */
function evalTrending(trendingRank, firstTrendingAt) {
  if (trendingRank === null || trendingRank === undefined) return null;

  let score = Math.round(config.trendingScoreForRank(trendingRank));

  if (firstTrendingAt) {
    const hoursIn    = (Date.now() - firstTrendingAt) / (60 * 60 * 1000);
    const decayHours = config.trendingDecayHours ?? 2;
    const decayFloor = config.trendingDecayFloor ?? 0.4;
    if (hoursIn > decayHours) {
      const t      = Math.min(1, (hoursIn - decayHours) / decayHours);
      const factor = 1 - t * (1 - decayFloor);
      score        = Math.round(score * factor);
    }
  }

  return {
    name: 'trending',
    score: clamp(score, 0, 100),
    label: `#${trendingRank} trending`,
    weight: config.weights.trending,
  };
}

/**
 * Market cap sweet spot signal.
 */
function evalMarketCap(marketCapUsd) {
  if (!marketCapUsd || marketCapUsd <= 0) return null;

  const { mcSweetSpotMin: min, mcSweetSpotMax: max } = config;
  let score;

  if (marketCapUsd < min) {
    score = clamp((marketCapUsd / min) * 60, 10, 60);
  } else if (marketCapUsd <= max) {
    score = 100;
  } else {
    const decay = (marketCapUsd - max) / (config.maxMarketCapUsd - max);
    score = clamp(Math.round(100 - decay * 100), 0, 100);
  }

  const fmt = marketCapUsd >= 1e6
    ? `$${(marketCapUsd / 1e6).toFixed(2)}M`
    : `$${(marketCapUsd / 1e3).toFixed(0)}K`;

  return { name: 'marketCap', score: Math.round(score), label: `MC ${fmt}`, weight: config.weights.marketCap };
}

/**
 * Holder count signal — simple threshold scoring.
 */
function evalHolderGrowth(holderCount) {
  if (holderCount === null || holderCount === undefined) return null;

  let score;
  if (holderCount >= 5000)       score = 100;
  else if (holderCount >= 1000)  score = 80;
  else if (holderCount >= 500)   score = 60;
  else if (holderCount >= 200)   score = 40;
  else if (holderCount >= 50)    score = 20;
  else                           score = 5;

  return { name: 'holderGrowth', score, label: `${holderCount} holders`, weight: config.weights.holderGrowth };
}

/**
 * Token age signal — 3–14 days = sweet spot.
 */
function evalTokenAge(tokenAgeDays) {
  if (tokenAgeDays === null || tokenAgeDays === undefined) return null;

  const { ageScoreMin, ageScoreMax } = config;
  let score;

  if (tokenAgeDays < 1) {
    score = 0;
  } else if (tokenAgeDays < ageScoreMin) {
    score = clamp((tokenAgeDays / ageScoreMin) * 50, 10, 50);
  } else if (tokenAgeDays <= ageScoreMax) {
    score = 100;
  } else if (tokenAgeDays <= 30) {
    score = clamp(100 - ((tokenAgeDays - ageScoreMax) / (30 - ageScoreMax)) * 60, 40, 100);
  } else {
    score = 20;
  }

  const label = `${tokenAgeDays.toFixed(1)}d old`;
  return { name: 'tokenAge', score: Math.round(score), label, weight: config.weights.tokenAge };
}

/**
 * EMA Cross signal — bullish/bearish crossover.
 */
function evalEmaCross(emaCross) {
  if (!emaCross || emaCross.fastEma === null) return null;

  let score;
  if (emaCross.bullishCross)           score = 100;
  else if (emaCross.label === 'EMA_BULLISH') score = 65;
  else if (emaCross.bearishCross)      score = 5;
  else                                 score = 20;

  return { name: 'emaCross', score, label: emaCross.label, weight: config.weights.emaCross };
}

/**
 * Volume-Price Confirmation signal.
 */
function evalVolumeTrend(volumeTrend, volumeClimax) {
  if (!volumeTrend || volumeTrend.priceSlope === null) return null;
  if (volumeTrend.label === 'INSUFFICIENT_DATA' || volumeTrend.label === 'NO_VOLUME_DATA') return null;

  let score;
  let label = volumeTrend.label;

  if (volumeClimax && volumeClimax.isClimax) {
    if (volumeClimax.type === 'selling') {
      score = 75;
      label = 'SELLING_CLIMAX';
    } else if (volumeClimax.type === 'buying') {
      score = 30;
      label = 'BUYING_CLIMAX';
    } else {
      score = null;
    }
  }

  if (score == null) {
    switch (volumeTrend.label) {
      case 'VOL_CONFIRM_BULL':  score = 90;  break;
      case 'VOL_EXHAUSTION':    score = 65;  break;
      case 'VOL_DIVERGE_WARN':  score = 30;  break;
      case 'VOL_CONFIRM_BEAR':  score = 10;  break;
      default:                  score = 50;  break;
    }
  }

  return { name: 'volumeTrend', score, label, weight: config.weights.volumeTrend };
}

/**
 * Divergence signal — RSI + MACD divergence.
 */
function evalDivergence(divergence) {
  if (!divergence) return null;

  const { rsiDivergence, macdDivergence } = divergence;
  if (!rsiDivergence || !macdDivergence) return null;

  const rsiBull = rsiDivergence.bullish;
  const rsiBear = rsiDivergence.bearish;
  const macdBull = macdDivergence.bullish;
  const macdBear = macdDivergence.bearish;

  const hasBull = rsiBull || macdBull;
  const hasBear = rsiBear || macdBear;
  if (!hasBull && !hasBear) return null;

  let score;
  let label;

  if (rsiBull && macdBull) {
    score = 100;
    label = 'DOUBLE_BULL_DIVERGENCE';
  } else if (hasBull && !hasBear) {
    score = 85;
    label = rsiBull ? 'RSI_BULL_DIVERGENCE' : 'MACD_BULL_DIVERGENCE';
  } else if (rsiBear && macdBear) {
    score = 0;
    label = 'DOUBLE_BEAR_DIVERGENCE';
  } else if (hasBear && !hasBull) {
    score = 15;
    label = rsiBear ? 'RSI_BEAR_DIVERGENCE' : 'MACD_BEAR_DIVERGENCE';
  } else {
    score = 50;
    label = 'MIXED_DIVERGENCE';
  }

  return { name: 'divergence', score, label, weight: config.weights.divergence };
}

/**
 * ADX signal — trend strength.
 */
function evalADX(adx) {
  if (!adx || adx.value === null) return null;
  if (adx.label === 'INSUFFICIENT_DATA') return null;

  let score;
  switch (adx.label) {
    case 'STRONG_TREND': score = adx.rising ? 95 : 85; break;
    case 'TRENDING':     score = adx.rising ? 75 : 60; break;
    case 'WEAK_TREND':   score = 40; break;
    case 'RANGING':      score = 20; break;
    default:             score = 50; break;
  }

  if (adx.plusDI != null && adx.minusDI != null) {
    if (adx.label === 'TRENDING' || adx.label === 'STRONG_TREND') {
      score += (adx.plusDI - adx.minusDI) > 0 ? 10 : -10;
    }
  }

  return { name: 'adx', score: clamp(score, 0, 100), label: adx.label, weight: config.weights.adx };
}

/**
 * Bollinger Bands signal.
 */
function evalBollingerBands(bb) {
  if (!bb || bb.upper === null) return null;
  if (bb.label === 'INSUFFICIENT_DATA') return null;

  let score;
  let label = bb.label;

  if (bb.expansionDirection === 'up' && bb.squeezeDuration > 0) {
    score = 85;
    label = 'SQUEEZE_BREAKOUT_UP';
  } else if (bb.expansionDirection === 'down' && bb.squeezeDuration > 0) {
    score = 15;
    label = 'SQUEEZE_BREAKOUT_DOWN';
  } else if (bb.squeeze && bb.squeezeDuration >= 3) {
    score = 60;
    label = 'TIGHT_SQUEEZE';
  } else {
    switch (bb.label) {
      case 'SQUEEZE':      score = 70; break;
      case 'BELOW_LOWER':  score = 85; break;
      case 'NEAR_LOWER':   score = 70; break;
      case 'MID_BAND':     score = 40; break;
      case 'NEAR_UPPER':   score = 25; break;
      case 'ABOVE_UPPER':  score = 15; break;
      default:             score = 40; break;
    }
  }

  return { name: 'bollingerBands', score, label, weight: config.weights.bollingerBands };
}

/**
 * OBV signal — On-Balance Volume.
 */
function evalOBV(obv) {
  if (!obv || obv.value === null) return null;
  if (obv.label === 'INSUFFICIENT_DATA' || obv.label === 'NO_VOLUME_DATA') return null;

  let score;
  switch (obv.label) {
    case 'OBV_BULL_DIVERGE':  score = 90; break;
    case 'OBV_CONFIRM_BULL':  score = 75; break;
    case 'OBV_FLAT':          score = 45; break;
    case 'OBV_CONFIRM_BEAR':  score = 20; break;
    case 'OBV_BEAR_DIVERGE':  score = 10; break;
    default:                  score = 45; break;
  }

  return { name: 'obv', score, label: obv.label, weight: config.weights.obv };
}

/**
 * RSI Failure Swing signal.
 */
function evalRsiFailureSwing(fsw) {
  if (!fsw || fsw.label === 'INSUFFICIENT_DATA') return null;
  if (fsw.label === 'NONE') return null;

  let score;
  if (fsw.label === 'RSI_BULL_FAIL_SWING') score = 95;
  else if (fsw.label === 'RSI_BEAR_FAIL_SWING') score = 5;
  else return null;

  return { name: 'rsiFailureSwing', score, label: fsw.label, weight: config.weights.rsiFailureSwing };
}

/**
 * Discovery confluence signal — how many sources found this token.
 */
function evalDiscoveryConfluence(discoverySources) {
  if (!Array.isArray(discoverySources) || discoverySources.length === 0) return null;

  const count = discoverySources.length;
  let score;
  if (count >= 4) score = 100;
  else if (count === 3) score = 80;
  else if (count === 2) score = 50;
  else score = 0;

  const label = `${count} source${count !== 1 ? 's' : ''} (${discoverySources.join(', ')})`;
  return { name: 'discoveryConfluence', score, label, weight: config.weights.discoveryConfluence ?? 0 };
}

/**
 * Twitter signal — stubbed; always returns null (weight = 0).
 */
function evalTwitter(_twitterSignals) {
  return null;
}

/**
 * Stochastic signal — %K/%D crossovers for mean-reversion.
 * Weight 0 (data collection).
 */
function evalStochastic(stochastic) {
  if (!stochastic || stochastic.kLine === null) return null;
  if (stochastic.label === 'INSUFFICIENT_DATA') return null;

  let score;
  switch (stochastic.label) {
    case 'BULLISH_CROSS':   score = 90;  break;
    case 'OVERSOLD':        score = 85;  break;
    case 'OVERBOUGHT':      score = 20;  break;
    case 'BEARISH_CROSS':   score = 10;  break;
    case 'NEUTRAL':
    default:
      score = stochastic.kLine > stochastic.dLine ? 65 : 40;
      break;
  }

  return { name: 'stochastic', score, label: stochastic.label, weight: config.weights.stochastic ?? 0 };
}

/**
 * VWAP signal — price relative to volume-weighted average.
 * Weight 0 (data collection).
 */
function evalVWAP(vwap) {
  if (!vwap || vwap.vwapPrice === null) return null;
  if (vwap.label === 'INSUFFICIENT_DATA') return null;

  let score;
  const dist = vwap.distance ?? 0;

  if (dist < -3) {
    score = 85;
  } else if (Math.abs(dist) <= 1) {
    score = 70;
  } else if (dist > 3) {
    score = 20;
  } else {
    score = 50;
  }

  return { name: 'vwap', score, label: vwap.label, weight: config.weights.vwap ?? 0 };
}

/**
 * Ichimoku Cloud signal.
 * Weight 0 (data collection).
 */
function evalIchimoku(ichimoku) {
  if (!ichimoku || ichimoku.conversionLine === null) return null;
  if (ichimoku.label === 'INSUFFICIENT_DATA') return null;

  let score;
  const { cloudColor, priceVsCloud, tkBullishCross, tkBearishCross } = ichimoku;

  if (cloudColor === 'green' && priceVsCloud === 'above') {
    score = tkBullishCross ? 95 : 90;
  } else if (cloudColor === 'green' && priceVsCloud === 'inside') {
    score = 75;
  } else if (cloudColor === 'red' && priceVsCloud === 'below') {
    score = tkBearishCross ? 5 : 10;
  } else if (cloudColor === 'red' && priceVsCloud === 'inside') {
    score = 25;
  } else {
    score = 50;
  }

  return { name: 'ichimoku', score, label: ichimoku.label, weight: config.weights.ichimoku ?? 0 };
}

/**
 * Chart pattern signal — double top/bottom, H&S, flags, triangles, pennants.
 * Weight 0 (metadata).
 */
function evalChartPatterns(chartPatterns) {
  if (!chartPatterns || !chartPatterns.patterns || chartPatterns.patterns.length === 0) return null;

  const best = chartPatterns.patterns.reduce((a, b) => (b.confidence > a.confidence ? b : a), chartPatterns.patterns[0]);

  const PATTERN_SCORES = {
    DOUBLE_BOTTOM:                  85,
    DOUBLE_TOP:                     15,
    INVERSE_HEAD_AND_SHOULDERS:     90,
    HEAD_AND_SHOULDERS:             10,
    BULL_FLAG:                      80,
    BEAR_FLAG:                      20,
    ASCENDING_TRIANGLE:             75,
    DESCENDING_TRIANGLE:            25,
    PENNANT_BULL:                   75,
    PENNANT_BEAR:                   25,
  };

  const score = PATTERN_SCORES[best.type] ?? 50;
  const label = `${best.type} (${best.confidence}%)`;

  return { name: 'chartPatterns', score, label, weight: config.weights.chartPatterns ?? 0 };
}

module.exports = {
  evalRSI,
  evalMACD,
  evalFibonacci,
  evalEmaCross,
  evalTrending,
  evalMarketCap,
  evalHolderGrowth,
  evalTokenAge,
  evalVolumeTrend,
  evalDivergence,
  evalADX,
  evalBollingerBands,
  evalOBV,
  evalRsiFailureSwing,
  evalDiscoveryConfluence,
  evalTwitter,
  evalChartPatterns,
  evalStochastic,
  evalVWAP,
  evalIchimoku,
};
