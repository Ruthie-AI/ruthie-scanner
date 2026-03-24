'use strict';

const config          = require('../config');
const dexscreener     = require('./dexscreener');
const birdeye         = require('./birdeye');
const jupiter         = require('./jupiter');
const logger          = require('../utils/logger');
const cuBudget        = require('../utils/cu-budget');

/**
 * Enrich a token stub with data from all sources.
 * Uses Promise.allSettled so one failure doesn't block the rest.
 *
 * @param {object} tokenStub — from dexscreener.normalizeTrendingEntry()
 * @returns {Promise<object>}  merged TokenData
 */
async function enrichToken(tokenStub) {
  const { mint } = tokenStub;

  // ── Birdeye access decision (CU budget only) ─────────────────────────────
  const budget       = cuBudget.budgetLevel();
  const isWatchlist  = !!tokenStub.isWatchlist;
  const isPriority   = isWatchlist;

  let fetchOverview = false;
  let fetchOhlcv    = false;
  let fetchHolders  = false;
  let ohlcvCacheTtl = config.birdeye.ohlcvCacheTtlMs;  // default 15min

  if (budget === 'exhausted') {
    // No Birdeye calls at all
  } else if (budget === 'reduced') {
    // Only priority tokens (watchlist)
    if (isPriority) { fetchOverview = true; fetchOhlcv = true; fetchHolders = true; }
  } else {
    // Normal — all tokens get OHLCV + holders. Caches prevent redundant calls.
    fetchOverview = true;
    fetchOhlcv    = true;
    fetchHolders  = true;
  }

  // Backpressure: skip OHLCV when the rate-limit queue is too deep (cold start)
  const ohlcvQueueOk = birdeye.queueDepth() < config.birdeye.maxOhlcvQueueDepth;
  if (!ohlcvQueueOk) fetchOhlcv = false;

  const preCacheRes = config.birdeye.ohlcvPreCacheResolutions || ['15m'];

  // Build fetch promises based on access decision
  // Per-resolution cache TTL: 1H candles only change once/hour → cache longer to save CU
  const ohlcvCacheTtls = config.birdeye.ohlcvCacheTtls ?? {};
  const ohlcvPromises = fetchOhlcv
    ? preCacheRes.map(res => birdeye.fetchOHLCV(mint, res, ohlcvCacheTtls[res] ?? ohlcvCacheTtl))
    : [];

  const [
    pairResult,
    birdeyeResult,
    jupiterResult,
    holderResult,
    ...ohlcvResults
  ] = await Promise.allSettled([
    dexscreener.fetchPairData(mint),
    fetchOverview ? birdeye.fetchTokenOverview(mint) : Promise.resolve(null),
    jupiter.fetchPrice(mint),
    fetchHolders ? birdeye.fetchTopHolders(mint) : Promise.resolve(null),
    ...ohlcvPromises,
  ]);

  // ── DexScreener pair data ─────────────────────────────────────────────────
  const pair = pairResult.status === 'fulfilled' ? pairResult.value : null;
  if (pairResult.status === 'rejected') {
    logger.warn(`enrichToken[${tokenStub.symbol}] dexscreener failed:`, pairResult.reason?.message);
  }

  let priceUsd    = tokenStub.priceUsd;
  let priceChange = tokenStub.priceChange ?? {};
  let liquidity   = tokenStub.liquidity;
  let marketCap   = tokenStub.marketCap;
  let volume      = tokenStub.volume ?? {};
  let pairCreatedAt = tokenStub.pairCreatedAt;
  let pairAddress = tokenStub.pairAddress ?? null;
  let dexId       = tokenStub.dexId ?? null;
  let candles     = [];

  if (pair) {
    priceUsd    = parseFloat(pair.priceUsd ?? '0') || null;
    priceChange = pair.priceChange ?? {};
    liquidity   = pair.liquidity?.usd ?? null;
    marketCap   = pair.marketCap ?? null;
    volume      = pair.volume ?? {};
    pairCreatedAt = pair.pairCreatedAt ?? pairCreatedAt;
    candles     = dexscreener.extractCandles(pair);
    pairAddress = pair.pairAddress ?? pairAddress;
    dexId       = pair.dexId ?? dexId;
    // pair.baseToken is the authoritative source for name and symbol — always prefer it
    if (pair.baseToken) {
      tokenStub.name   = pair.baseToken.name   ?? tokenStub.name;
      tokenStub.symbol = pair.baseToken.symbol ?? tokenStub.symbol;
    }
    // pair.info.imageUrl is the full CDN URL; the boosts stub only has a raw hash
    if (pair.info?.imageUrl) {
      tokenStub.icon = pair.info.imageUrl;
    }
  }

  // ── DexScreener buy/sell transaction pressure ───────────────────────────────
  const txns = pair?.txns ?? {};
  const txnsBuysH1   = txns.h1?.buys   ?? 0;
  const txnsSellsH1  = txns.h1?.sells  ?? 0;
  const txnsBuysH24  = txns.h24?.buys  ?? 0;
  const txnsSellsH24 = txns.h24?.sells ?? 0;
  const totalH1      = txnsBuysH1 + txnsSellsH1;
  const buyPressureH1 = totalH1 > 0 ? txnsBuysH1 / totalH1 : 0.5;

  // ── Jupiter price fallback ──────────────────────────────────────────────────
  const jupiterPrice = jupiterResult.status === 'fulfilled' ? jupiterResult.value : null;
  if (!priceUsd && jupiterPrice) {
    priceUsd = jupiterPrice;
    logger.debug(`enrichToken[${tokenStub.symbol}] using Jupiter fallback price: $${jupiterPrice}`);
  }

  // ── Birdeye OHLCV candles (prefer over DexScreener synthetic candles) ─────
  // Build ohlcv map from all fetched resolutions
  const ohlcv = {};
  const fetchedRes = fetchOhlcv ? preCacheRes : [];
  for (let i = 0; i < ohlcvResults.length; i++) {
    const r = ohlcvResults[i];
    const data = r.status === 'fulfilled' ? r.value : null;
    if (Array.isArray(data) && data.length >= 4) {
      ohlcv[fetchedRes[i]] = data;
    }
  }

  // Use 15m for TA pipeline (backward compat)
  if (ohlcv['15m']) {
    candles = ohlcv['15m'];
    logger.debug(`enrichToken[${tokenStub.symbol}] using ${candles.length} Birdeye OHLCV candles`);
  } else if (!fetchOhlcv && !ohlcvQueueOk) {
    logger.debug(`enrichToken[${tokenStub.symbol}] OHLCV skipped — queue full (${birdeye.queueDepth()} pending)`);
  }

  // ── Birdeye top holders → concentration metrics ──────────────────────────
  const topHolders = holderResult.status === 'fulfilled' ? holderResult.value : null;
  let holderConcentration = tokenStub.holderConcentration ?? null; // carry forward
  if (topHolders && topHolders.length > 0) {
    // Estimate total supply: sum of all returned holder amounts as floor,
    // or use marketCap / priceUsd when available for better accuracy
    const holderSum = topHolders.reduce((s, h) => s + (h.uiAmount ?? 0), 0);
    let totalSupply = holderSum; // floor: at minimum, holders hold this much
    const pUsd = priceUsd || parseFloat(pair?.priceUsd ?? '0') || 0;
    const mCap = marketCap || pair?.marketCap || 0;
    if (pUsd > 0 && mCap > 0) {
      totalSupply = mCap / pUsd;
    }

    if (totalSupply > 0) {
      const top10 = topHolders.slice(0, 10);
      const top10Sum = top10.reduce((s, h) => s + (h.uiAmount ?? 0), 0);
      const top30Sum = holderSum;
      const maxSingle = Math.max(...topHolders.map(h => h.uiAmount ?? 0));
      const whaleThreshold = totalSupply * 0.02;
      const whaleCount = topHolders.filter(h => (h.uiAmount ?? 0) >= whaleThreshold).length;

      holderConcentration = {
        top10Pct:      parseFloat(((top10Sum / totalSupply) * 100).toFixed(2)),
        top30Pct:      parseFloat(((top30Sum / totalSupply) * 100).toFixed(2)),
        maxSinglePct:  parseFloat(((maxSingle / totalSupply) * 100).toFixed(2)),
        whaleCount,
        topHolders,    // raw array for future smart wallet cross-ref
      };
    }
  }

  // ── Birdeye overview ────────────────────────────────────────────────────
  const birdeyeData = birdeyeResult.status === 'fulfilled' ? birdeyeResult.value : null;

  // Carry forward previous data when Birdeye was skipped
  const holderCount      = birdeyeData?.holder            ?? tokenStub.holderCount      ?? null;
  const uniqueWallet24h  = birdeyeData?.uniqueWallet24h   ?? tokenStub.uniqueWallet24h  ?? null;
  const trade24h         = birdeyeData?.trade24h          ?? tokenStub.trade24h         ?? null;
  const buy24h           = birdeyeData?.buy24h            ?? tokenStub.buy24h           ?? null;
  const sell24h          = birdeyeData?.sell24h           ?? tokenStub.sell24h          ?? null;
  const v24hChangePercent = birdeyeData?.v24hChangePercent ?? tokenStub.v24hChangePercent ?? null;
  const prevOhlcv   = tokenStub.ohlcv;
  const finalOhlcv  = Object.keys(ohlcv).length ? ohlcv : prevOhlcv || undefined;

  // Token age in days from pairCreatedAt (unix ms)
  let tokenAge = null;
  if (pairCreatedAt) {
    tokenAge = (Date.now() - pairCreatedAt) / (1000 * 60 * 60 * 24);
  }

  return {
    ...tokenStub,
    name:   tokenStub.name,
    symbol: tokenStub.symbol,
    priceUsd,
    priceChange,
    liquidity,
    marketCap,
    volume,
    pairCreatedAt,
    candles,
    pairAddress,
    dexId,
    ohlcv: finalOhlcv,
    holderCount,
    uniqueWallet24h,
    trade24h,
    buy24h,
    sell24h,
    v24hChangePercent,
    tokenAge,
    txnsBuysH1,
    txnsSellsH1,
    txnsBuysH24,
    txnsSellsH24,
    buyPressureH1,
    holderConcentration,
    twitterSignals: null,
    icon: tokenStub.icon,
    updatedAt: Date.now(),
  };
}

module.exports = { enrichToken };
