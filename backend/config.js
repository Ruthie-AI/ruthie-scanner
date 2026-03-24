'use strict';

const config = {
  // ── Server ──────────────────────────────────────────────────────────────────
  port: parseInt(process.env.PORT, 10) || 3001,

  // ── Pipeline intervals ───────────────────────────────────────────────────────
  discoveryIntervalMs: 5 * 60 * 1000,   // 5 min — find new trending tokens
  enrichmentIntervalMs: 30 * 1000,      // 30 sec — re-analyze tracked tokens
  maxTrackedTokens: 45,
  discoveryReserveSlots: 10,            // guaranteed slots for new discovery

  // ── Discovery blocklist — mints excluded from the pipeline ────────────────
  // Stablecoins, wrapped assets, majors, governance tokens.
  blockedMints: new Set([
    'So11111111111111111111111111111111111111112',   // SOL (native)
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  // USDT
    'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',   // USD1
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',   // JUP
    'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD',   // JupUSD
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',  // JitoSOL
    'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',   // JTO
    '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',  // WBTC
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',  // Bonk
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',  // $WIF
    'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux',   // HNT
    'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',  // PYTH
    'RndrGSCBJMJJjqHvnGarUOVYD2cBw9zCLH3dbcK2nwS',   // RNDR
    'RAYimQ3fAf2hAFjnFYbUhg5yrGHSEMGFAGRSpCbz2pS',   // RAY
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',   // mSOL
    'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',   // bSOL
    '9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D',  // jlUSDC (Jito Liquid USDC)
    'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH',  // CASH — spam/scam
  ]),

  // ── Liquidity / quality filters ─────────────────────────────────────────────
  minLiquidityUsd: 10_000,              // $10K — discard micro-pools
  minMarketCapUsd: 50_000,
  maxMarketCapUsd: 12_000_000,          // $12M hard ceiling

  // ── Market cap sweet-spot for scoring ───────────────────────────────────────
  mcSweetSpotMin: 250_000,             // $250K
  mcSweetSpotMax: 1_000_000,           // $1M

  // ── Token age filter / scoring ──────────────────────────────────────────────
  minTokenAgeDays: 3,                   // hard floor — tokens younger than 3d are skipped
  ageScoreMin: 3,                       // 3d — starts scoring positively
  ageScoreMax: 14,                      // 14d — sweet spot ceiling

  // ── Holder count ────────────────────────────────────────────────────────────
  minHolders: 300,                      // hard floor — below this → skipped

  // ── RSI thresholds ──────────────────────────────────────────────────────────
  rsiOversold: 30,                      // <= 30 → max score
  rsiNeutralLow: 40,                    // 30–40 → partial score
  rsiOverbought: 70,                    // >= 70 → negative contribution
  rsiPeriod: 14,

  // ── MACD parameters ─────────────────────────────────────────────────────────
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,

  // ── Fibonacci retracement key levels ────────────────────────────────────────
  fibLevels: [0.236, 0.382, 0.5, 0.618, 0.786],
  fibTolerance: 0.015,                  // ±1.5% around each fib level

  // ── Alert / scoring thresholds ──────────────────────────────────────────────
  alertCooldownMs: 60 * 60 * 1000,     // 1 hour per token

  // ── Trending score decay ──────────────────────────────────────────────────────
  trendingDecayHours: 2,    // start decaying trending score after 2h in feed
  trendingDecayFloor: 0.4,  // minimum multiplier (40% of original score) after 4h+
  thresholds: {
    STRONG_BUY: 90,
    BUY: 75,
    WATCH: 60,
    NEUTRAL: 40,
    // below NEUTRAL = AVOID
  },

  // ── EMA Cross parameters ─────────────────────────────────────────────────────
  emaFast: 9,
  emaSlow: 21,

  // ── Trend-context modulation (Murphy Ch.4/8/10) ────────────────────────────
  trendContextPenalty:  0.6,  // EMA/MACD score multiplier in downtrends
  sidewaysTrendPenalty: 0.85, // EMA/MACD score multiplier in sideways markets

  // ── ADX parameters ──────────────────────────────────────────────────────────
  adxPeriod:      14,
  adxTrendingMin: 25,
  adxRangingMax:  20,

  // ── Bollinger Bands parameters ─────────────────────────────────────────────
  bbPeriod:            20,
  bbStdDev:            2,
  bbSqueezeThreshold:  0.10,

  // ── Signal weights ──────────────────────────────────────────────────────────
  // TA signals (scored — must sum to ~1.0):
  // Edge signals (metadata — weight 0.00, tracked for informational purposes):
  weights: {
    rsi:             0.24,
    macd:            0.22,
    emaCross:        0.14,
    volumeTrend:     0.10,
    divergence:      0.06,
    adx:             0.08,
    bollingerBands:  0.06,
    obv:             0.06,
    rsiFailureSwing: 0.04,
    fibonacci:       0.00,   // metadata — tracked for display, not scored
    trending:        0.00,   // metadata
    marketCap:       0.00,   // metadata
    holderGrowth:    0.00,   // metadata
    tokenAge:        0.00,   // metadata
    discoveryConfluence: 0.00, // metadata — multi-source discovery signal
    twitter:         0.00,   // stubbed
  },

  // ── DexScreener ─────────────────────────────────────────────────────────────
  dexscreener: {
    baseUrl: 'https://api.dexscreener.com',
    boostsUrl: '/token-boosts/top/v1',
    profilesUrl: '/token-profiles/latest/v1',
    pairsUrl: '/latest/dex/tokens',       // + /{mint}
    chain: 'solana',
    topN: 50,
    ohlcvResolution: '5m',
  },

  // ── Helius ──────────────────────────────────────────────────────────────────
  helius: {
    rpcUrl: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || ''}`,
  },

  // ── Birdeye ─────────────────────────────────────────────────────────────────
  birdeye: {
    baseUrl: 'https://public-api.birdeye.so',
    ohlcvUrl: '/defi/ohlcv',
    overviewUrl: '/defi/token_overview',
    ohlcvResolution: '15m',
    ohlcvLimit: 50,
    maxOhlcvQueueDepth: 30,
    ohlcvPreCacheResolutions: ['15m', '1H'],
    ohlcvOnDemandResolutions: ['1m', '5m', '30m', '1H'],
    ohlcvLimits: { '1m': 100, '5m': 50, '15m': 50, '30m': 50, '1H': 50 },

    // Trending discovery
    trendingUrl: '/defi/token_trending',
    cuCostTrending: 30,
    trendingTopN: 50,

    // CU budget management (Premium Plus tier: 20M CU/month)
    cuDailyBudget:          666_666,
    cuCostOverview:         30,
    cuCostOhlcv:            40,
    cuCostHolders:          50,
    overviewCacheTtlMs:     4 * 60 * 60 * 1000,
    holderCacheTtlMs:       4 * 60 * 60 * 1000,
    ohlcvCacheTtlMs:        30 * 60 * 1000,
    ohlcvCacheTtls:         { '1H': 55 * 60 * 1000 },
    ohlcvExtendedCacheTtlMs: 40 * 60 * 1000,

    // Top holder analysis
    holderUrl:              '/defi/v3/token/holder',
  },

  // ── Higher-Timeframe Confirmation (1H) ──────────────────────────────────
  htf: {
    enabled:          true,
    signals:          ['swingPoints', 'emaCross', 'macd', 'adx'],
    conflictPenalty:  0.5,
    alignedBonus:     1.0,
    sidewaysPenalty:  0.85,
  },

  // ── Jupiter ─────────────────────────────────────────────────────────────────
  jupiter: {
    priceUrl: 'https://price.jup.ag/v4/price',
  },

  // ── Jupiter Trending ──────────────────────────────────────────────────────
  jupiterTrending: {
    baseUrl:   'https://api.jup.ag/tokens/v2',
    topN:      50,
    timeframe: '1h',
  },

  // ── GeckoTerminal ─────────────────────────────────────────────────────────
  geckoTerminal: {
    baseUrl: 'https://api.geckoterminal.com/api/v2',
    topN:    50,
  },

  // ── Pump.fun ─────────────────────────────────────────────────────────────────
  pumpfun: {
    baseUrl:       'https://frontend-api.pump.fun',
    topN:          50,
    graduatedOnly: false,
  },

  // ── Rugcheck ──────────────────────────────────────────────────────────────────
  rugcheck: {
    baseUrl:     'https://api.rugcheck.xyz',
    maxScore:    500,
    blockDanger: true,
  },

  // ── API concurrency (protect free-tier rate limits) ─────────────────────────
  fetchConcurrency: 5,

  // ── DexScreener trending rank → trending score ───────────────────────────────
  trendingScoreForRank(rank) {
    return Math.max(20, 100 - (rank - 1) * (80 / 49));
  },
};

module.exports = config;
