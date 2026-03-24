'use strict';

require('dotenv').config();

const fs      = require('fs');
const http    = require('http');
const path    = require('path');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const config      = require('./config');
const cache       = require('./pipeline/cache');
const watchlist   = require('./pipeline/watchlist');
const logger      = require('./utils/logger');

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// REST: snapshot of all cached tokens (backup for clients that miss WS init)
app.get('/api/snapshot', (_req, res) => {
  res.json({ tokens: cache.all(), serverTime: Date.now() });
});

// ── Watchlist endpoints ────────────────────────────────────────────────────────
app.get('/api/watchlist', (_req, res) => {
  res.json({ mints: watchlist.all() });
});

app.post('/api/watchlist', (req, res) => {
  const { mint } = req.body ?? {};
  if (!mint || typeof mint !== 'string') {
    return res.status(400).json({ error: 'mint is required' });
  }
  watchlist.add(mint);
  // Immediately kick off processing so card appears quickly
  const runner = require('./pipeline/runner');
  const stub = cache.get(mint) ?? {
    mint,
    symbol: mint.slice(0, 6),
    name:   mint.slice(0, 6),
    trendingRank: null,
    isWatchlist: true,
  };
  runner.processToken({ ...stub, isWatchlist: true }).catch(() => {});
  res.status(201).json({ mint });
});

app.delete('/api/watchlist/:mint', (req, res) => {
  watchlist.remove(req.params.mint);
  res.status(204).end();
});

// ── On-demand OHLCV endpoint (1m, 30m — not pre-cached) ─────────────────────
const birdeye    = require('./fetchers/birdeye');
const cuBudget   = require('./utils/cu-budget');
const normalizer = require('./analysis/normalizer');
const _ohlcvRateLimit = new Map(); // mint:res → lastFetchedAt

app.get('/api/tokens/:mint/ohlcv', async (req, res) => {
  const mint = req.params.mint.toLowerCase();
  const resolution = req.query.resolution || '15m';

  const allowed = [...(config.birdeye.ohlcvPreCacheResolutions || []),
                   ...(config.birdeye.ohlcvOnDemandResolutions || [])];
  if (!allowed.includes(resolution)) {
    return res.status(400).json({ error: `Invalid resolution. Allowed: ${allowed.join(', ')}` });
  }

  // For pre-cached resolutions, try the cache first
  const cached = cache.get(mint);
  if (cached?.ohlcv?.[resolution]) {
    const candles = normalizer.toOHLCV(cached.ohlcv[resolution]);
    return res.json({ candles, resolution, source: 'cache' });
  }

  // Rate limit: 1 request per mint+resolution per 30s
  const rlKey = `${mint}:${resolution}`;
  const lastFetch = _ohlcvRateLimit.get(rlKey) || 0;
  if (Date.now() - lastFetch < 30_000) {
    return res.status(429).json({ error: 'Rate limited — try again in 30s' });
  }

  _ohlcvRateLimit.set(rlKey, Date.now());
  const raw = await birdeye.fetchOHLCV(mint, resolution);
  if (!raw || !raw.length) {
    return res.status(404).json({ error: 'No OHLCV data available' });
  }

  const candles = normalizer.toOHLCV(raw);
  res.json({ candles, resolution, source: 'birdeye' });
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    trackedTokens: cache.size,
    serverTime: Date.now(),
  });
});

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(app);

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

/** @type {Set<WebSocket>} */
const clients = new Set();

wss.on('connection', (ws, req) => {
  clients.add(ws);
  logger.info(`WS client connected (${clients.size} total) from ${req.socket.remoteAddress}`);

  // Send snapshot immediately on connect
  const snapshot = cache.all();
  for (const payload of snapshot) {
    safeSend(ws, { type: 'token:update', payload });
  }
  safeSend(ws, {
    type: 'status',
    payload: {
      trackedCount: cache.size,
      serverTime: Date.now(),
      birdeye: {
        budgetLevel:    cuBudget.budgetLevel(),
        usagePct:       parseFloat(cuBudget.usagePct().toFixed(1)),
        backoff:        birdeye.isBackedOff(),
        backoffMinutes: birdeye.backoffMinutesRemaining(),
        queueDepth:     birdeye.queueDepth(),
      },
    },
  });

  // Handle messages from client
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'snapshot:request') {
      for (const payload of cache.all()) {
        safeSend(ws, { type: 'token:update', payload });
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    logger.info(`WS client disconnected (${clients.size} remaining)`);
  });

  ws.on('error', (err) => {
    logger.warn('WS client error:', err.message);
    clients.delete(ws);
  });
});

/**
 * Broadcast a message to all connected WebSocket clients.
 * @param {{ type: string, payload: object }} msg
 */
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    safeSend(ws, null, data);
  }
}

function safeSend(ws, msg, preEncoded) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(preEncoded ?? JSON.stringify(msg));
  } catch (err) {
    logger.warn('WS send error:', err.message);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(config.port, () => {
  logger.info(`Server running at http://localhost:${config.port}`);

  // Start the pipeline after server is up
  const runner = require('./pipeline/runner');
  runner.start(broadcast);
});

module.exports = { broadcast };
