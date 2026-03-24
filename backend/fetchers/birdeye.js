'use strict';

const path     = require('path');
const fs       = require('fs');
const config   = require('../config');
const logger   = require('../utils/logger');
const cuBudget = require('../utils/cu-budget');

const API_KEY = process.env.BIRDEYE_API_KEY || '';
const TIMEOUT_MS = 8_000;
const MIN_REQUEST_GAP_MS = 1_050; // ~1 RPS — Birdeye free tier limit

const BACKOFF_TTL_MS         = 60 * 60 * 1000; // 1 hr — stop all requests after account-level error
const NETWORK_BACKOFF_TTL_MS = 5 * 60 * 1000;  // 5 min — shorter backoff for network failures (DNS, timeout, refused)
const NETWORK_FAILURE_THRESHOLD = 5;            // consecutive failures before triggering backoff

const _ohlcvCache    = new Map(); // mint → { data, fetchedAt }
const _overviewCache = new Map(); // mint → { data, fetchedAt }
const _holderCache   = new Map(); // mint → { data, fetchedAt }

/* ── OHLCV Disk Cache (temporary — eliminates restart CU tax) ── */
const OHLCV_CACHE_PATH = path.join(__dirname, '..', 'logs', 'ohlcv-cache.json');
const DISK_SAVE_DEBOUNCE_MS = 10_000; // write at most once per 10s
let _diskSaveTimer = null;

function _loadDiskCache() {
  try {
    if (!fs.existsSync(OHLCV_CACHE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(OHLCV_CACHE_PATH, 'utf8'));
    const ttl = config.birdeye.ohlcvCacheTtlMs;
    const now = Date.now();
    let loaded = 0;
    for (const [key, entry] of Object.entries(raw.entries || {})) {
      if (now - entry.fetchedAt <= ttl) {
        _ohlcvCache.set(key, { data: entry.data, fetchedAt: entry.fetchedAt });
        loaded++;
      }
    }
    if (loaded > 0) logger.info(`[OHLCV-CACHE] Loaded ${loaded} entries from disk`);
  } catch (err) {
    logger.warn(`[OHLCV-CACHE] Failed to load disk cache: ${err.message}`);
  }
}

function _saveDiskCache() {
  if (_diskSaveTimer) return; // already scheduled
  _diskSaveTimer = setTimeout(() => {
    _diskSaveTimer = null;
    try {
      const entries = {};
      for (const [key, entry] of _ohlcvCache) {
        entries[key] = { data: entry.data, fetchedAt: entry.fetchedAt };
      }
      fs.writeFileSync(OHLCV_CACHE_PATH, JSON.stringify({ savedAt: Date.now(), entries }));
    } catch (err) {
      logger.warn(`[OHLCV-CACHE] Failed to save disk cache: ${err.message}`);
    }
  }, DISK_SAVE_DEBOUNCE_MS);
}

_loadDiskCache();

/** Account-level backoff — set when 400/401/403 indicates quota/auth exhausted. */
let _backoffUntil = 0;
let _backoffLogged = false;

/** Network failure tracking — DNS, timeout, connection refused, etc. */
let _consecutiveNetworkFailures = 0;

/** Return cached data if still within TTL, otherwise null. */
function _getCached(cache, mint, ttlMs) {
  const entry = cache.get(mint);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) {
    cache.delete(mint);
    return null;
  }
  return entry.data;
}

let _lastRequestTime = 0;
const _queue = [];
let _draining = false;

/** Serialize all Birdeye requests to respect 1 RPS rate limit. */
function enqueue(url, cuCost = 0) {
  if (!API_KEY) return Promise.resolve(null);
  if (Date.now() < _backoffUntil) return Promise.resolve(null);
  if (_backoffLogged && Date.now() >= _backoffUntil) _backoffLogged = false;
  if (cuCost > 0 && !cuBudget.canSpend(cuCost)) return Promise.resolve(null);
  return new Promise(resolve => {
    _queue.push({ url, resolve, cuCost });
    if (!_draining) _drain();
  });
}

async function _drain() {
  _draining = true;
  while (_queue.length > 0) {
    const now = Date.now();
    const wait = MIN_REQUEST_GAP_MS - (now - _lastRequestTime);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const { url, resolve, cuCost } = _queue.shift();
    _lastRequestTime = Date.now();
    const result = await _fetchJson(url);
    if (result !== null && cuCost > 0) cuBudget.spend(cuCost);
    resolve(result);
  }
  _draining = false;
}

async function _fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'X-API-KEY': API_KEY,
        'x-chain': 'solana',
      },
    });
    if (!res.ok) {
      // Account-level failures (bad key, forbidden) — back off everything
      // Note: 400 excluded — bad request is per-call (invalid mint), not account-level
      if (res.status === 401 || res.status === 403) {
        _backoffUntil = Date.now() + BACKOFF_TTL_MS;
        if (!_backoffLogged) {
          const mins = Math.round(BACKOFF_TTL_MS / 60_000);
          logger.warn(`Birdeye HTTP ${res.status} — backing off all requests for ${mins} min`);
          _backoffLogged = true;
        }
      }
      throw new Error(`HTTP ${res.status}`);
    }
    // Successful response — clear any active backoff and reset network failure counter
    _backoffUntil = 0;
    _backoffLogged = false;
    _consecutiveNetworkFailures = 0;
    return await res.json();
  } catch (err) {
    // Non-HTTP errors (DNS, timeout, connection refused) — track consecutive failures
    if (!err.message.startsWith('HTTP')) {
      _consecutiveNetworkFailures++;
      if (_consecutiveNetworkFailures >= NETWORK_FAILURE_THRESHOLD && Date.now() >= _backoffUntil) {
        _backoffUntil = Date.now() + NETWORK_BACKOFF_TTL_MS;
        const mins = Math.round(NETWORK_BACKOFF_TTL_MS / 60_000);
        logger.warn(`Birdeye ${_consecutiveNetworkFailures} consecutive network failures — backing off ${mins} min`);
      }
    }
    if (!_backoffLogged || !err.message.startsWith('HTTP')) {
      logger.warn(`Birdeye fetch failed (${url}):`, err.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch token overview (holder count, market cap) from Birdeye.
 * @param {string} mint
 * @returns {Promise<{ holder: number|null } | null>}
 */
async function fetchTokenOverview(mint) {
  const cached = _getCached(_overviewCache, mint, config.birdeye.overviewCacheTtlMs);
  if (cached) {
    logger.debug(`Birdeye overview cache hit: ${mint.slice(0, 8)}…`);
    return cached;
  }

  const url = `${config.birdeye.baseUrl}${config.birdeye.overviewUrl}?address=${mint}`;
  const json = await enqueue(url, config.birdeye.cuCostOverview);
  if (!json?.success || !json?.data) return null;

  const d = json.data;
  const result = {
    holder:            d.holder            ?? null,
    uniqueWallet24h:   d.uniqueWallet24h   ?? null,
    trade24h:          d.trade24h          ?? null,
    buy24h:            d.buy24h            ?? null,
    sell24h:           d.sell24h           ?? null,
    v24hChangePercent: d.v24hChangePercent ?? null,
  };
  _overviewCache.set(mint, { data: result, fetchedAt: Date.now() });
  return result;
}

/**
 * Fetch OHLCV candles from Birdeye.
 * @param {string} mint
 * @param {string} [resolution] — e.g. '1m', '5m', '15m', '30m', '1H'
 * @param {number} [cacheTtlMs] — override cache TTL (e.g. extended TTL for mid-score tokens)
 * @returns {Promise<object[]|null>}  raw Birdeye candles or null on failure
 */
async function fetchOHLCV(mint, resolution, cacheTtlMs) {
  const res = resolution || config.birdeye.ohlcvResolution;
  const ttl = cacheTtlMs || config.birdeye.ohlcvCacheTtlMs;
  const cacheKey = `${mint}:${res}`;

  const cached = _getCached(_ohlcvCache, cacheKey, ttl);
  if (cached) {
    logger.debug(`Birdeye OHLCV cache hit: ${mint.slice(0, 8)}… (${res})`);
    return cached;
  }

  const limit = config.birdeye.ohlcvLimits?.[res] ?? config.birdeye.ohlcvLimit;

  // Map resolution string to seconds
  const resSec = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1H': 3600, '4H': 14400, '1D': 86400 };
  const stepSec = resSec[res] || 900;

  const timeTo   = Math.floor(Date.now() / 1000);
  const timeFrom = timeTo - (limit * stepSec);

  const url = `${config.birdeye.baseUrl}${config.birdeye.ohlcvUrl}`
    + `?address=${mint}&type=${res}&time_from=${timeFrom}&time_to=${timeTo}`;

  const json = await enqueue(url, config.birdeye.cuCostOhlcv);
  if (!json?.success || !Array.isArray(json?.data?.items)) return null;

  const items = json.data.items;
  _ohlcvCache.set(cacheKey, { data: items, fetchedAt: Date.now() });
  _saveDiskCache();
  return items;
}

/**
 * Fetch top holders for a token from Birdeye.
 * @param {string} mint
 * @param {number} [limit=30] — number of top holders to return
 * @returns {Promise<object[]|null>} array of { owner, amount, uiAmount } or null on failure
 */
async function fetchTopHolders(mint, limit = 30) {
  const ttl = config.birdeye.holderCacheTtlMs ?? (4 * 60 * 60 * 1000);
  const cached = _getCached(_holderCache, mint, ttl);
  if (cached) {
    logger.debug(`Birdeye holder cache hit: ${mint.slice(0, 8)}…`);
    return cached;
  }

  const url = `${config.birdeye.baseUrl}${config.birdeye.holderUrl}?address=${mint}&limit=${limit}&sort_type=desc`;
  const json = await enqueue(url, config.birdeye.cuCostHolders ?? 50);
  if (!json?.success || !json?.data?.items || !Array.isArray(json.data.items)) return null;

  const result = json.data.items.map(h => ({
    owner:    h.owner ?? h.wallet ?? null,
    amount:   h.amount ?? null,
    uiAmount: h.uiAmount ?? h.ui_amount ?? null,
  }));

  _holderCache.set(mint, { data: result, fetchedAt: Date.now() });
  return result;
}

/** Current number of pending requests in the rate-limit queue. */
function queueDepth() {
  return _queue.length;
}

/** True when the module is in account-level backoff (HTTP 400/401/403). */
function isBackedOff() {
  return Date.now() < _backoffUntil;
}

/** Minutes remaining in backoff, or 0 if not backed off. */
function backoffMinutesRemaining() {
  const ms = _backoffUntil - Date.now();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

/**
 * Fetch trending tokens from Birdeye (discovery source).
 * 3 paginated calls (limit 20, offsets 0/20/40) → up to 60 entries, capped at trendingTopN.
 * Returns [] when no API key or during backoff.
 * @returns {Promise<object[]>}
 */
async function fetchTrending() {
  if (!API_KEY) return [];
  if (Date.now() < _backoffUntil) return [];

  const topN = config.birdeye.trendingTopN ?? 50;
  const cuCost = config.birdeye.cuCostTrending ?? 30;
  const url = `${config.birdeye.baseUrl}${config.birdeye.trendingUrl}`;

  const pages = [0, 20, 40].map(offset =>
    enqueue(`${url}?sort_by=rank&sort_type=asc&offset=${offset}&limit=20`, cuCost)
  );

  const results = await Promise.allSettled(pages);

  const all = [];
  for (const r of results) {
    if (r.status === 'rejected' || !r.value) continue;
    const tokens = r.value?.data?.tokens ?? [];
    if (Array.isArray(tokens)) all.push(...tokens);
  }

  return all.slice(0, topN);
}

/**
 * Normalize a Birdeye trending entry to the standard discovery stub shape.
 * @param {object} entry — from Birdeye token_trending response
 * @param {number} rank — 0-based index in the combined result array
 * @returns {{ mint: string, symbol: string, name: string, birdeyeRank: number, trendingRank: null }}
 */
function normalizeEntry(entry, rank) {
  return {
    mint:            entry.address ?? null,
    symbol:          entry.symbol ?? 'UNKNOWN',
    name:            entry.name ?? entry.symbol ?? 'Unknown',
    birdeyeRank:     rank + 1,
    trendingRank:    null,
    jupiterRank:     null,
    geckoTerminalRank: null,
  };
}

module.exports = { fetchTokenOverview, fetchOHLCV, fetchTopHolders, fetchTrending, normalizeEntry, queueDepth, isBackedOff, backoffMinutesRemaining };
