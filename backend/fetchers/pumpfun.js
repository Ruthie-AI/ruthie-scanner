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

async function fetchTrending() {
  const { baseUrl, topN, graduatedOnly } = config.pumpfun;
  const url = `${baseUrl}/coins?offset=0&limit=${topN}&sort=last_trade_unix_timestamp&order=DESC&includeNsfw=false`;
  const data = await fetchJson(url);
  const coins = Array.isArray(data) ? data : [];
  return graduatedOnly ? coins.filter(c => c.complete === true) : coins;
}

function normalizeEntry(entry, rank) {
  return {
    mint:             entry.mint ?? '',
    name:             entry.name ?? 'Unknown',
    symbol:           entry.symbol ?? '???',
    icon:             entry.image_uri ?? null,
    pairCreatedAt:    entry.created_timestamp ? entry.created_timestamp * 1000 : null,
    trendingRank:     null,
    pumpfunRank:      rank + 1,
    pumpfunGraduated: entry.complete ?? false,
    priceUsd:         null,
    priceChange:      {},
    liquidity:        null,
    marketCap:        entry.usd_market_cap ?? null,
    volume:           {},
    candles:          [],
    holderCount:      null,
    tokenAge:         null,
    isWatchlist:      false,
  };
}

module.exports = { fetchTrending, normalizeEntry };
