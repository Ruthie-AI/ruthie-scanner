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
 * Fetch trending tokens from Jupiter Tokens API V2.
 * Fetches both toptrending (volume-based) and toporganicscore (wash-trade filtered)
 * in parallel, merges + deduplicates (organic wins on overlap).
 *
 * Requires JUPITER_API_KEY env var. Returns [] without key (like Birdeye pattern).
 */
async function fetchTrending() {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    logger.debug('Jupiter Trending: no JUPITER_API_KEY — skipping');
    return [];
  }

  const { baseUrl, topN, timeframe } = config.jupiterTrending;
  const headers = { 'x-api-key': apiKey };

  const fetchCat = async (category) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const url = `${baseUrl}/${category}/${timeframe}?limit=${topN}`;
      const res = await fetch(url, { signal: controller.signal, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const [trendingResult, organicResult] = await Promise.allSettled([
    fetchCat('toptrending'),
    fetchCat('toporganicscore'),
  ]);

  const trending = trendingResult.status === 'fulfilled' ? (Array.isArray(trendingResult.value) ? trendingResult.value : []) : [];
  const organic  = organicResult.status  === 'fulfilled' ? (Array.isArray(organicResult.value)  ? organicResult.value  : []) : [];

  if (trendingResult.status === 'rejected') logger.warn('Jupiter Trending: toptrending fetch failed:', trendingResult.reason?.message);
  if (organicResult.status  === 'rejected') logger.warn('Jupiter Trending: toporganicscore fetch failed:', organicResult.reason?.message);

  // Organic score wins on overlap (higher quality signal)
  const seen = new Set();
  const merged = [];

  for (const entry of organic) {
    const mint = entry.id ?? entry.address ?? entry.mint ?? '';
    if (mint && !seen.has(mint)) {
      seen.add(mint);
      merged.push({ ...entry, _organic: true });
    }
  }
  for (const entry of trending) {
    const mint = entry.id ?? entry.address ?? entry.mint ?? '';
    if (mint && !seen.has(mint)) {
      seen.add(mint);
      merged.push({ ...entry, _organic: false });
    }
  }

  return merged.slice(0, topN);
}

function normalizeEntry(entry, rank) {
  return {
    mint:             entry.id ?? entry.address ?? entry.mint ?? '',
    name:             entry.name ?? 'Unknown',
    symbol:           entry.symbol ?? '???',
    icon:             entry.icon ?? entry.logoURI ?? null,
    pairCreatedAt:    null,
    trendingRank:     null,
    pumpfunRank:      null,
    jupiterRank:      rank + 1,
    jupiterOrganic:   entry._organic ?? false,
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
