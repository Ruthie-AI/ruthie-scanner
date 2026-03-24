'use strict';

const config = require('../config');
const logger = require('../utils/logger');

const TIMEOUT_MS = 8_000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract Solana mint address from GeckoTerminal token ID.
 * Format: "solana_<MINT_ADDRESS>"
 */
function extractMint(tokenId) {
  if (!tokenId || typeof tokenId !== 'string') return '';
  return tokenId.startsWith('solana_') ? tokenId.slice(7) : tokenId;
}

/**
 * Fetch trending tokens from GeckoTerminal.
 * Fetches trending_pools + new_pools in parallel, extracts base token mints,
 * deduplicates (trending wins on overlap). Caps at topN.
 *
 * Rate limit: 30 calls/min free. 2 calls per 5-min cycle = well within limits.
 */
async function fetchTrending() {
  const { baseUrl, topN } = config.geckoTerminal;

  const [trendingResult, newPoolsResult] = await Promise.allSettled([
    fetchJson(`${baseUrl}/networks/solana/trending_pools`),
    fetchJson(`${baseUrl}/networks/solana/new_pools`),
  ]);

  const trendingPools = trendingResult.status === 'fulfilled' ? (trendingResult.value?.data ?? []) : [];
  const newPools      = newPoolsResult.status === 'fulfilled' ? (newPoolsResult.value?.data ?? [])  : [];

  if (trendingResult.status === 'rejected') logger.warn('GeckoTerminal: trending_pools failed:', trendingResult.reason?.message);
  if (newPoolsResult.status === 'rejected') logger.warn('GeckoTerminal: new_pools failed:', newPoolsResult.reason?.message);

  // Trending pools win on overlap (established activity > mere newness)
  const seen = new Set();
  const merged = [];

  for (const pool of trendingPools) {
    const mint = extractMint(pool.relationships?.base_token?.data?.id);
    if (mint && !seen.has(mint)) {
      seen.add(mint);
      merged.push({ ...pool, _mint: mint, _newPool: false });
    }
  }
  for (const pool of newPools) {
    const mint = extractMint(pool.relationships?.base_token?.data?.id);
    if (mint && !seen.has(mint)) {
      seen.add(mint);
      merged.push({ ...pool, _mint: mint, _newPool: true });
    }
  }

  return merged.slice(0, topN);
}

function normalizeEntry(pool, rank) {
  const attrs = pool.attributes ?? {};
  const name  = (attrs.name ?? 'Unknown').split(' / ')[0]; // "Punch / SOL" → "Punch"

  return {
    mint:             pool._mint ?? '',
    name,
    symbol:           name,          // GeckoTerminal pools don't separate symbol; enrichToken overwrites
    icon:             null,          // no icon from GeckoTerminal — enrichToken fills from pair data
    pairCreatedAt:    attrs.pool_created_at ? new Date(attrs.pool_created_at).getTime() : null,
    trendingRank:     null,
    pumpfunRank:      null,
    geckoRank:        rank + 1,
    geckoNewPool:     pool._newPool ?? false,
    priceUsd:         null,
    priceChange:      {},
    liquidity:        null,
    marketCap:        null,
    volume:           {},
    candles:          [],
    holderCount:      null,
    tokenAge:         null,
    isWatchlist:      false,
  };
}

module.exports = { fetchTrending, normalizeEntry };
