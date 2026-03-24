# Solana Scanner

Real-time Solana meme coin scanner with technical analysis scoring. Discovers trending tokens across 5 sources, runs 9 TA signals on OHLCV candles, and produces a composite buy-opportunity score — all in a live dashboard.

## What It Does

- **5-source discovery** — DexScreener, Pump.fun, Jupiter Trending, GeckoTerminal, Birdeye
- **9 TA signals** — RSI, MACD, EMA Cross, Volume Trend, Divergence, ADX, Bollinger Bands, OBV, RSI Failure Swings
- **Composite scoring** — Weighted TA score with trend-context modulation (Murphy principles)
- **Persistent watchlist** — Pin tokens by contract address, bypass eviction
- **Real-time dashboard** — WebSocket-powered UI with score categories, signal chips, sparklines
- **Confluence tracking** — Tokens appearing on multiple sources are flagged
- **Rugcheck filtering** — Automatic rug detection via Rugcheck API

## Quick Start

```bash
# Install dependencies
npm install

# Configure API keys
cp .env.example .env
# Edit .env — add your Birdeye API key (required for OHLCV candles)

# Start the server
npm run dev

# Open dashboard
open http://localhost:3001
```

## API Keys

| Service | Required | Free Tier | Purpose |
|---------|----------|-----------|---------|
| Birdeye | Yes | Starter ($99/mo) | OHLCV candles, holder data, trending |
| Jupiter Trending | Optional | Paid | Swap volume discovery source |
| Helius | Optional | Free | On-chain RPC |

Without Birdeye, the scanner falls back to synthetic DexScreener candles (4 data points) — enough for basic scoring but not full TA.

## Architecture

```
DexScreener (boosts top-50)     ─┐
Pump.fun (recent trades)        ─┤
Jupiter Trending (swap volume)  ─┤  (parallel, deduplicated, confluence tracked)
GeckoTerminal (trending pools)  ─┤
Birdeye Trending (token_trending)─┘
       │
       ▼
 Discovery Loop (5 min)
       │ new stubs
       ▼
  processToken()
       │
       ├── fetchers/index.js ── DexScreener, Birdeye, Jupiter (parallel)
       ├── analysis/index.js ── 9 TA signals on OHLCV candles
       ├── scoring/engine.js ── composite score + category
       │
       ▼
   cache.js  ◄── watchlist.js (pins, bypass eviction)
       │
       └── WebSocket broadcast → frontend dashboard
```

### Pipeline Timing

| Loop | Interval | Description |
|------|----------|-------------|
| Discovery | 5 min | Fetch trending from all 5 sources |
| Enrichment | 30 sec | Re-analyze all cached tokens |
| Alert cooldown | 1 hr | Per-token alert suppression |

## Score Categories

| Score | Category | Visual |
|-------|----------|--------|
| >= 90 | STRONG_BUY | Green glow pulse |
| >= 75 | BUY | Soft green |
| >= 60 | WATCH | Yellow |
| >= 40 | NEUTRAL | Default |
| < 40 | AVOID | Red, 60% opacity |

## TA Signals & Weights

| Signal | Weight | Source |
|--------|--------|--------|
| RSI | 0.24 | Wilder's RSI (14-period) |
| MACD | 0.22 | 12/26/9 standard |
| EMA Cross | 0.14 | 9/21 EMA crossover |
| Volume Trend | 0.10 | Price-volume confirmation |
| ADX | 0.08 | Trend strength (14-period) |
| Bollinger Bands | 0.06 | Squeeze + band position |
| Divergence | 0.06 | RSI/MACD divergence |
| OBV | 0.06 | On-balance volume |
| RSI Failure Swing | 0.04 | Wilder's failure swings |

Weights re-normalize automatically when signals return null (insufficient data).

## API Endpoints

```bash
# Snapshot — all cached tokens
curl http://localhost:3001/api/snapshot

# Watchlist
curl http://localhost:3001/api/watchlist
curl -X POST http://localhost:3001/api/watchlist \
  -H 'Content-Type: application/json' \
  -d '{"mint":"<CONTRACT_ADDRESS>"}'
curl -X DELETE http://localhost:3001/api/watchlist/<CONTRACT_ADDRESS>

# OHLCV candles (on-demand)
curl 'http://localhost:3001/api/tokens/<MINT>/ohlcv?resolution=15m'
```

## Configuration

All tunable parameters live in `backend/config.js`:

- **Quality filters** — `minLiquidityUsd`, `maxMarketCapUsd`, `minHolders`, `minTokenAgeDays`
- **Signal weights** — `config.weights` object
- **Scoring thresholds** — `config.thresholds` (STRONG_BUY=90, BUY=75, etc.)
- **Pipeline timing** — `discoveryIntervalMs`, `enrichmentIntervalMs`

## Tests

```bash
npx jest              # run all tests
npx jest --watch      # watch mode
```

## Want More?

This is the scanner layer. The full platform includes:
- **Trading Brain** — autonomous entry/exit with closed-loop calibration
- **Social Brain** — intent-based reply composition, engagement tracking
- **Perps Brain** — Drift Protocol perpetual futures
- **KOL Tracker** — credibility scoring for crypto influencers

## License

MIT
