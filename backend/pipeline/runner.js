'use strict';

const config      = require('../config');
const logger      = require('../utils/logger');
const cuBudget    = require('../utils/cu-budget');
const cache       = require('./cache');
const watchlist   = require('./watchlist');
const dexscreener     = require('../fetchers/dexscreener');
const pumpfun         = require('../fetchers/pumpfun');
const jupiterTrending = require('../fetchers/jupiter-trending');
const geckoTerminal   = require('../fetchers/geckoterminal');
const rugcheck        = require('../fetchers/rugcheck');
const fetchers    = require('../fetchers/index');
const birdeye     = require('../fetchers/birdeye');
const analysis    = require('../analysis/index');
const engine      = require('../scoring/engine');

// p-limit v4 is ESM-only — we use a simple home-grown concurrency limiter
// to avoid the dynamic import complexity in MVP.
function createLimiter(concurrency) {
  let active = 0;
  const queue = [];
  function next() {
    while (active < concurrency && queue.length > 0) {
      const { fn, resolve, reject } = queue.shift();
      active++;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => { active--; next(); });
    }
  }
  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

const limit = createLimiter(config.fetchConcurrency);

// Alert cooldown: mint → timestamp of last alert
const alertCooldown = new Map();

let broadcastFn = null;
let discoveryTimer = null;
let enrichmentTimer = null;
let _lastDiscovery = null;

/** Build the status payload broadcast to all WS clients. */
function _buildStatus(overrides = {}) {
  return {
    trackedCount: cache.size,
    lastDiscovery: overrides.lastDiscovery ?? _lastDiscovery,
    serverTime: Date.now(),
    birdeye: {
      budgetLevel:    cuBudget.budgetLevel(),
      usagePct:       parseFloat(cuBudget.usagePct().toFixed(1)),
      backoff:        birdeye.isBackedOff(),
      backoffMinutes: birdeye.backoffMinutesRemaining(),
      queueDepth:     birdeye.queueDepth(),
    },
  };
}

/**
 * Emit a message to all WebSocket clients.
 */
function emit(type, payload) {
  if (broadcastFn) broadcastFn({ type, payload });
}

/**
 * Check alert cooldown and emit alert if eligible.
 */
function maybeAlert(payload) {
  if (!payload.shouldAlert) return;
  const last = alertCooldown.get(payload.mint) ?? 0;
  if (Date.now() - last < config.alertCooldownMs) return;

  alertCooldown.set(payload.mint, Date.now());
  emit('alert', {
    mint:     payload.mint,
    name:     payload.name,
    symbol:   payload.symbol,
    score:    payload.compositeScore,
    category: payload.category,
  });
  logger.info(`ALERT [${payload.category}] ${payload.symbol} — score ${payload.compositeScore}`);
}

/**
 * Process a single token through the full pipeline.
 * @param {object} stub  — from normalizeTrendingEntry or existing cache entry
 */
async function processToken(stub) {
  try {
    // ── Rugcheck pre-filter + data attach (new tokens only) ───────────────────
    // Runs before enrichToken to avoid wasting API calls on rugs.
    // Skipped for tokens already in cache (re-enrichment — rugcheck data is
    // immutable and persists via cache spread).
    // Watchlist tokens are never dropped, but still get data attached.
    // null from fetchReport = API unreachable → fail open, continue.
    if (!cache.has(stub.mint)) {
      const report = await rugcheck.fetchReport(stub.mint);
      if (report !== null) {
        if (!stub.isWatchlist) {
          if (report.score >= config.rugcheck.maxScore) {
            logger.debug(`Rugcheck: drop ${stub.symbol ?? stub.mint.slice(0, 8)} — score ${report.score}`);
            return;
          }
          if (config.rugcheck.blockDanger && report.risks.some(r => r.level === 'danger')) {
            const names = report.risks.filter(r => r.level === 'danger').map(r => r.name).join(', ');
            logger.debug(`Rugcheck: drop ${stub.symbol ?? stub.mint.slice(0, 8)} — danger: ${names}`);
            return;
          }
        }
        stub.rugcheckScore = report.score;
        stub.rugcheckRisks = report.risks;
      }
    }

    // 1. Enrich with all data sources
    const tokenData = await fetchers.enrichToken(stub);

    // Basic quality filters — watchlist tokens bypass these (user added them intentionally)
    if (!tokenData.isWatchlist) {
      if (tokenData.liquidity !== null && tokenData.liquidity < config.minLiquidityUsd) {
        logger.debug(`Skipping ${stub.symbol}: low liquidity $${tokenData.liquidity}`);
        return;
      }
      if (tokenData.marketCap !== null && tokenData.marketCap > config.maxMarketCapUsd) {
        logger.debug(`Skipping ${stub.symbol}: market cap too high $${tokenData.marketCap}`);
        return;
      }
      if (tokenData.holderCount !== null && tokenData.holderCount < config.minHolders) {
        logger.debug(`Skipping ${stub.symbol}: too few holders (${tokenData.holderCount})`);
        return;
      }
      if (tokenData.tokenAge !== null && tokenData.tokenAge < config.minTokenAgeDays) {
        logger.debug(`Skipping ${stub.symbol}: too fresh (${tokenData.tokenAge?.toFixed(1)}d)`);
        return;
      }
    }

    // 2. Run TA on candles (15m)
    const ta = analysis.run(tokenData.candles);

    // 2b. Run 1H higher-timeframe confirmation (subset of signals)
    let htf = null;
    if (config.htf?.enabled && tokenData.ohlcv?.['1H']) {
      const ta1h = analysis.run(tokenData.ohlcv['1H']);
      htf = {
        swingPoints: ta1h.swingPoints,
        emaCross:    ta1h.emaCross,
        macd:        ta1h.macd,
        adx:         ta1h.adx,
      };
    }

    // 3. Build scored payload
    const scoredData = {
      ...tokenData,
      rsi:         ta.rsi,
      macd:        ta.macd,
      fibonacci:   ta.fibonacci,
      emaCross:    ta.emaCross,
      volumeTrend:  ta.volumeTrend,
      swingPoints:     ta.swingPoints,
      divergence:      ta.divergence,
      adx:             ta.adx,
      bollingerBands:  ta.bollingerBands,
      obv:             ta.obv,
      rsiFailureSwing: ta.rsiFailureSwing,
      atr:             ta.atr,
      htf,
    };

    // 4. Composite score
    const { compositeScore, taScore, category, signalBreakdown, shouldAlert, taSignalCount } = engine.composite(scoredData);

    // 4c. Score velocity — how fast is the score changing between enrichment cycles?
    const prev = cache.get(scoredData.mint);
    const previousScore = prev?.compositeScore ?? null;
    const scoreVelocity = previousScore != null
      ? compositeScore - previousScore : null;

    // 5. Build final TokenPayload
    // Track when a token first entered the trending feed for decay calculation.
    // Persists via cache spread on re-enrichment; resets to null when token leaves trending.
    const firstTrendingAt = scoredData.trendingRank != null
      ? (scoredData.firstTrendingAt ?? Date.now())
      : null;

    const payload = {
      ...scoredData,
      compositeScore,
      taScore,
      category,
      signalBreakdown,
      shouldAlert,
      taSignalCount,
      isWatchlist: stub.isWatchlist ?? false,
      firstTrendingAt,
      previousScore,
      scoreVelocity,
      edgeConfidence: null,
      edgeTier: null,
      updatedAt: Date.now(),
    };

    // 6. Store in cache
    cache.set(payload.mint, payload);

    // 7. Broadcast to clients
    emit('token:update', payload);

    // 8. Alert if warranted
    maybeAlert(payload);

  } catch (err) {
    logger.error(`processToken error for ${stub.symbol ?? stub.mint}:`, err.message);
  }
}

/**
 * Discovery loop — fetch trending tokens from DexScreener + Pump.fun and kick off processing.
 */
async function runDiscovery() {
  logger.info('Discovery: fetching trending tokens...');

  // All 5 sources in parallel
  const [dexResult, pumpResult, jupResult, geckoResult, birdeyeResult] = await Promise.allSettled([
    dexscreener.fetchTrending(),
    pumpfun.fetchTrending(),
    jupiterTrending.fetchTrending(),
    geckoTerminal.fetchTrending(),
    birdeye.fetchTrending(),
  ]);

  // Extract results, log failures
  // Priority: DexScreener > Pump.fun > Jupiter > GeckoTerminal > Birdeye (last — CU savings on deduped mints)
  const sources = [
    { label: 'DexScreener',    result: dexResult,       normalize: (e, i) => dexscreener.normalizeTrendingEntry(e, i) },
    { label: 'Pump.fun',       result: pumpResult,      normalize: (e, i) => pumpfun.normalizeEntry(e, i) },
    { label: 'Jupiter',        result: jupResult,        normalize: (e, i) => jupiterTrending.normalizeEntry(e, i) },
    { label: 'GeckoTerminal',  result: geckoResult,      normalize: (e, i) => geckoTerminal.normalizeEntry(e, i) },
    { label: 'Birdeye',        result: birdeyeResult,    normalize: (e, i) => birdeye.normalizeEntry(e, i) },
  ];

  // ── Pass 1: Collect source presence for confluence tracking ─────────────
  const { blockedMints } = config;
  const confluenceMap = new Map(); // mintLower → Set<sourceLabel>

  for (const { label, result, normalize } of sources) {
    if (result.status === 'rejected') continue;
    const raw = Array.isArray(result.value) ? result.value : [];
    for (let i = 0; i < raw.length; i++) {
      try {
        const s = normalize(raw[i], i);
        if (!s.mint || blockedMints.has(s.mint)) continue;
        const key = s.mint.toLowerCase();
        if (!confluenceMap.has(key)) confluenceMap.set(key, new Set());
        confluenceMap.get(key).add(label.toLowerCase().replace(/\./g, ''));
      } catch { /* malformed entry — skip */ }
    }
  }

  // ── Pass 2: Priority dedup + attach confluence ────────────────────────────
  const seen = new Set();
  const allStubs = [];

  for (const { label, result, normalize } of sources) {
    if (result.status === 'rejected') {
      logger.error(`Discovery: ${label} failed:`, result.reason?.message);
      continue;
    }
    const raw = Array.isArray(result.value) ? result.value : [];
    const stubs = raw.map(normalize);
    let count = 0;
    for (const s of stubs) {
      if (!s.mint || blockedMints.has(s.mint) || seen.has(s.mint.toLowerCase())) continue;
      const mintLower = s.mint.toLowerCase();
      seen.add(mintLower);

      // Attach confluence data from pass 1
      const srcSet = confluenceMap.get(mintLower);
      s.discoverySources = srcSet ? Array.from(srcSet).sort() : [label.toLowerCase().replace(/\./g, '')];
      s.discoverySourceCount = s.discoverySources.length;

      allStubs.push(s);
      count++;
    }
    logger.info(`Discovery: ${label} contributed ${count} unique tokens`);
  }

  const fresh = allStubs.filter(s => s.mint && !cache.has(s.mint));
  logger.info(`Discovery: ${allStubs.length} total, ${fresh.length} new tokens to process`);

  await Promise.allSettled(fresh.map(stub => limit(() => processToken(stub))));

  cache.trim();
  _lastDiscovery = Date.now();
  emit('status', _buildStatus());
}

/**
 * Enrichment loop — re-analyze all cached tokens + any watchlist mints not yet cached.
 */
async function runEnrichment() {
  // Ensure all watchlist mints are present in the cache as stubs
  for (const mint of watchlist.all()) {
    if (!cache.has(mint)) {
      cache.set(mint, {
        mint,
        symbol: mint.slice(0, 6),
        name:   mint.slice(0, 6),
        trendingRank: null,
        isWatchlist: true,
      });
    }
  }

  const tokens = cache.all();
  if (tokens.length === 0) return;

  const queueBefore = birdeye.queueDepth();
  logger.debug(`Enrichment: re-analyzing ${tokens.length} tokens (Birdeye queue: ${queueBefore})`);
  cache.evictStale();

  // Sync isWatchlist flag with actual watchlist — clears stale pins from closed positions
  const tagged = tokens.map(t => ({ ...t, isWatchlist: watchlist.has(t.mint) }));

  await Promise.allSettled(tagged.map(t => limit(() => processToken(t))));

  cache.trim();

  const queueAfter = birdeye.queueDepth();
  if (queueAfter > 0) {
    logger.info(`Enrichment done — Birdeye queue still draining: ${queueAfter} pending`);
  }

  emit('status', _buildStatus());
}

/**
 * Start the pipeline. Called once after server is up.
 * @param {function} broadcast  — server.js broadcast()
 */
function start(broadcast) {
  broadcastFn = broadcast;

  // Run discovery immediately, then every 5 min
  runDiscovery();
  discoveryTimer = setInterval(runDiscovery, config.discoveryIntervalMs);

  // Enrichment starts after first discovery has had time to populate cache
  setTimeout(() => {
    runEnrichment();
    enrichmentTimer = setInterval(runEnrichment, config.enrichmentIntervalMs);
  }, 15_000);

  logger.info('Pipeline started. Discovery every 5 min, enrichment every 30 sec.');
}

/**
 * Graceful shutdown.
 */
function stop() {
  clearInterval(discoveryTimer);
  clearInterval(enrichmentTimer);
}

module.exports = { start, stop, processToken };
