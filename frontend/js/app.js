/**
 * App entry point — boots WS client, wires scanner modules.
 * App entry point for the scanner.
 */

import * as wsClient  from './ws-client.js';
import * as store     from './store.js';
import * as renderer  from './renderer.js';
import * as filters   from './filters.js';
import * as alerts    from './alerts.js';
import * as skinMgr   from './skin-manager.js';

// Solana addresses are base58, 32–44 chars.
const CA_RE = /^[1-9a-z]{32,44}$/;

// DOM refs
const statusText     = document.getElementById('status-text');
const statTracked    = document.getElementById('stat-tracked');
const statLastScan   = document.getElementById('stat-last-scan');
const statusDot      = document.getElementById('status-indicator');
const sidebarStatus  = document.getElementById('sidebar-status');
const moodEmoji      = document.getElementById('sidebar-mood-emoji');
const moodLabel      = document.getElementById('sidebar-mood-label');
const tabCountScan   = document.getElementById('tab-count-scanner');
const birdeyeBadge   = document.getElementById('birdeye-health');
const birdeyeReset   = document.getElementById('birdeye-reset');

// ── Connection status ─────────────────────────────────────────────────────────
window.addEventListener('ws:connected', () => {
  setStatus('live', 'Locked in');
});
window.addEventListener('ws:disconnected', () => {
  setStatus('connecting', 'Hold on...');
});
window.addEventListener('ws:brain:down', () => {
  setStatus('error', 'Service unavailable');
});
window.addEventListener('ws:brain:up', () => {
  setStatus('live', 'Locked in');
});

const STATUS_STATE_MAP = { live: 'status-state-live', connecting: 'status-state-connecting', error: 'status-state-error' };

function setStatus(cls, text) {
  if (statusText) statusText.textContent = text;

  const stateCls = STATUS_STATE_MAP[cls];
  if (statusDot) {
    statusDot.classList.remove('status-state-live', 'status-state-connecting', 'status-state-error');
    if (stateCls) statusDot.classList.add(stateCls);
  }

  if (sidebarStatus) {
    sidebarStatus.textContent = text;
    sidebarStatus.className = `sidebar-brand-status status-${cls}`;
  }
}

// ── Snapshot lifecycle (purge stale tokens on reconnect) ──────────────────────
window.addEventListener('ws:snapshot:start', () => {
  store.snapshotStart();
});

window.addEventListener('ws:snapshot:end', () => {
  const removed = store.snapshotEnd();
  if (removed > 0) {
    const fs = filters.getState();
    const tokens = store.filtered(fs);
    renderer.renderAll(tokens);
    updateCounts();
  }
});

// ── Token updates ─────────────────────────────────────────────────────────────
window.addEventListener('ws:token:update', (e) => {
  const token = e.detail;
  store.snapshotTrack(token.mint);
  store.upsert(token);
  const fs = filters.getState();
  const tokens = store.filtered(fs);
  renderer.renderAll(tokens);
  handleSearchEmpty(fs, tokens);

  // Live-update the analysis panel if this token is currently selected
  renderer.updateSelectedChart(token);

  updateCounts();
});

window.addEventListener('ws:token:remove', (e) => {
  const { mint } = e.detail;
  store.remove(mint);
  const fs = filters.getState();
  const tokens = store.filtered(fs);
  renderer.renderAll(tokens);
  updateCounts();
});

// ── Server status + Birdeye health ────────────────────────────────────────────
let _prevBirdeyeState = 'normal';
let _resetTimer = null;

function _timeToMidnightUTC() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const ms = midnight - now;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function _startResetCountdown() {
  if (_resetTimer) return;
  _updateResetDisplay();
  _resetTimer = setInterval(_updateResetDisplay, 60_000);
}

function _stopResetCountdown() {
  if (_resetTimer) { clearInterval(_resetTimer); _resetTimer = null; }
  if (birdeyeReset) birdeyeReset.hidden = true;
}

function _updateResetDisplay() {
  if (!birdeyeReset) return;
  birdeyeReset.textContent = 'resets ' + _timeToMidnightUTC();
  birdeyeReset.hidden = false;
}

window.addEventListener('ws:status', (e) => {
  const { trackedCount, lastDiscovery, birdeye: be } = e.detail;
  if (statTracked) statTracked.textContent = trackedCount ?? '--';
  if (statLastScan && lastDiscovery) {
    statLastScan.textContent = new Date(lastDiscovery).toLocaleTimeString();
  }

  if (be && birdeyeBadge) {
    const state = be.backoff ? 'backoff'
      : be.budgetLevel === 'exhausted' ? 'exhausted'
      : be.budgetLevel === 'reduced' ? 'reduced'
      : 'normal';

    if (state !== _prevBirdeyeState) {
      if (state === 'reduced') {
        alerts.showToast('Birdeye reduced mode', 'CU budget at ' + be.usagePct + '% — watchlist only', 'WATCH');
      } else if (state === 'exhausted') {
        alerts.showToast('Birdeye offline', 'CU budget exhausted — resets midnight UTC', 'AVOID');
      } else if (state === 'backoff') {
        alerts.showToast('Birdeye down', 'Auth error — retrying in ' + be.backoffMinutes + 'm', 'AVOID');
      } else if (state === 'normal' && _prevBirdeyeState !== 'normal') {
        alerts.showToast('Birdeye restored', 'Full TA pipeline back online', 'BUY');
      }
      _prevBirdeyeState = state;
    }

    birdeyeBadge.className = 'birdeye-health';
    if (state === 'normal') {
      birdeyeBadge.hidden = true;
      _stopResetCountdown();
    } else {
      birdeyeBadge.hidden = false;
      birdeyeBadge.classList.add(`birdeye-${state}`);
      if (state === 'reduced')        birdeyeBadge.textContent = 'CU ' + be.usagePct + '%';
      else if (state === 'exhausted') birdeyeBadge.textContent = 'CU Exhausted';
      else if (state === 'backoff')   birdeyeBadge.textContent = 'Birdeye Down';
      _startResetCountdown();
    }
  }
});

// ── Alerts ────────────────────────────────────────────────────────────────────
window.addEventListener('ws:alert', (e) => {
  alerts.handleAlert(e.detail);
});

// ── Filter changes → full re-render ─────────────────────────────────────────
filters.onChange((filterState) => {
  const tokens = store.filtered(filterState);
  renderer.renderAll(tokens);
  handleSearchEmpty(filterState, tokens);
  updateCounts();
});

// ── Search empty state ────────────────────────────────────────────────────────
function handleSearchEmpty(filterState, tokens) {
  const { search } = filterState;
  if (tokens.length === 0 && search && CA_RE.test(search)) {
    renderer.setEmptyMessage(`
      <p>Don't have that one yet.</p>
      <button class="btn-add-ca" id="btn-search-add">+ Add to watchlist</button>
    `);
    document.getElementById('btn-search-add')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-search-add');
      if (btn) { btn.textContent = 'On it...'; btn.disabled = true; }
      await store.addToWatchlist(search);
      filters.clearSearch();
      renderer.resetEmptyMessage();
    });
  } else if (search && tokens.length > 0) {
    renderer.resetEmptyMessage();
  } else if (!search) {
    renderer.resetEmptyMessage();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function updateCounts() {
  const n = store.size();
  if (statTracked) statTracked.textContent = n;
  if (tabCountScan) tabCountScan.textContent = n > 0 ? `(${n})` : '';
  updateMarketMood();
}

// ── Market mood — aggregate sentiment from live token data ──────────────────
const MOOD_TABLE = [
  { min: 70, emoji: '&#x1F525;', label: 'On Fire',    cls: 'mood-fire'    },
  { min: 55, emoji: '&#x1F7E2;', label: 'Bullish',    cls: 'mood-bullish' },
  { min: 45, emoji: '&#x1F7E1;', label: 'Neutral',    cls: 'mood-neutral' },
  { min: 30, emoji: '&#x1F7E0;', label: 'Cautious',   cls: 'mood-cautious'},
  { min:  0, emoji: '&#x1F534;', label: 'Bearish',    cls: 'mood-bearish' },
];

function updateMarketMood() {
  const allTokens = store.all();
  if (!allTokens.length) return;

  let scoreSum = 0, scoreN = 0, chgSum = 0, chgN = 0;
  for (const t of allTokens) {
    if (t.compositeScore != null) { scoreSum += t.compositeScore; scoreN++; }
    if (t.priceChange?.h1 != null) { chgSum += t.priceChange.h1; chgN++; }
  }
  const avgScore = scoreN > 0 ? scoreSum / scoreN : 50;
  const avgChg   = chgN > 0 ? chgSum / chgN : 0;

  const momentumScore = Math.max(0, Math.min(100, 50 + avgChg * 2));
  const moodScore = avgScore * 0.6 + momentumScore * 0.4;

  const mood = MOOD_TABLE.find(m => moodScore >= m.min) || MOOD_TABLE[MOOD_TABLE.length - 1];

  const moodEl = document.getElementById('sidebar-mood');
  if (moodEmoji) moodEmoji.innerHTML = mood.emoji;
  if (moodLabel) moodLabel.textContent = mood.label;
  if (moodEl) {
    moodEl.className = 'sidebar-mood';
    moodEl.classList.add(mood.cls);
  }
  if (sidebarStatus) sidebarStatus.textContent = `Avg score: ${Math.round(avgScore)}`;
}

// ── Header price ticker ──────────────────────────────────────────────────────
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=solana,bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true';

const COIN_MAP = {
  solana:   { key: 'sol', decimals: 2 },
  bitcoin:  { key: 'btc', decimals: 0 },
  ethereum: { key: 'eth', decimals: 0 },
};

async function fetchMajorPrices() {
  try {
    const res = await fetch(COINGECKO_URL);
    if (!res.ok) return;
    const data = await res.json();
    if (data.solana?.usd) {
      window.__solUsd = data.solana.usd;
      window.dispatchEvent(new CustomEvent('sol:price', { detail: data.solana.usd }));
    }
    for (const [id, cfg] of Object.entries(COIN_MAP)) {
      const info = data[id];
      if (!info) continue;
      const valEl = document.querySelector(`[data-coin="${cfg.key}"]`);
      const chgEl = document.querySelector(`[data-coin-chg="${cfg.key}"]`);
      if (valEl) {
        valEl.textContent = '$' + info.usd.toLocaleString('en-US', {
          minimumFractionDigits: cfg.decimals,
          maximumFractionDigits: cfg.decimals,
        });
      }
      if (chgEl && info.usd_24h_change != null) {
        const pct = info.usd_24h_change;
        const up = pct >= 0;
        chgEl.className = `header-price-chg ${up ? 'up' : 'down'}`;
        chgEl.textContent = `${up ? '\u25B2' : '\u25BC'}${Math.abs(pct).toFixed(1)}%`;
      }
    }
  } catch { /* fail silently */ }
}

function startPriceTicker() {
  fetchMajorPrices();
  setInterval(fetchMajorPrices, 30_000);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
skinMgr.init();
filters.init();
alerts.init();
wsClient.init();
startPriceTicker();

// Hydrate local watchlist state so pin badges render correctly on first snapshot
fetch('/api/watchlist')
  .then(r => r.ok ? r.json() : null)
  .then(data => { if (data?.mints) store.hydrateWatchlist(data.mints); })
  .catch(() => {});
