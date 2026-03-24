/**
 * DOM renderer — diff-updates token cards without full re-render.
 * DOM renderer for the scanner.
 */

import { drawSparkline, drawMiniSparkline, scoreColor } from './charts.js';
import * as store from './store.js';
import { fmtPrice } from './formatters.js';
import { showToast } from './alerts.js';

const grid = document.getElementById('token-grid');
const emptyState = document.getElementById('empty-state');

// ── SVG icon constants ──────────────────────────────────────────────────────────
const SVG_PIN = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 11V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"/><path d="M5 17h14"/><path d="M7 11l-2 6h14l-2-6"/></svg>';

/** @type {Map<string, HTMLElement>} */
const cardMap = new Map();

let _skeletonsRemoved = false;
function removeSkeletons() {
  if (_skeletonsRemoved) return;
  _skeletonsRemoved = true;
  grid.querySelectorAll('.card-skeleton').forEach(el => el.remove());
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmtMCap(mc) {
  if (!mc) return '--';
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(2)}M`;
  if (mc >= 1e3) return `$${(mc / 1e3).toFixed(0)}K`;
  return `$${mc.toFixed(0)}`;
}

function fmtChange(pct) {
  if (pct === undefined || pct === null) return '';
  const sign = pct >= 0 ? '\u25B2' : '\u25BC';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function fmtAge(days) {
  if (days === null || days === undefined) return '--';
  if (days < 1) return `${Math.round(days * 24)}h`;
  return `${days.toFixed(1)}d`;
}

function fmtHolders(n) {
  if (n == null) return '--';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function signalChipClass(label, score) {
  const positive = ['OVERSOLD', 'NEAR_OVERSOLD', 'BULL_CROSS', 'BULLISH', 'HIST_TURN_UP', 'AT_KEY_LEVEL', 'AT_FIB_LEVEL', 'EMA_CROSS_UP', 'EMA_BULLISH', 'VOL_CONFIRM_BULL', 'VOL_EXHAUSTION', 'RSI_BULL_DIVERGENCE', 'MACD_BULL_DIVERGENCE', 'DOUBLE_BULL_DIVERGENCE', 'SQUEEZE', 'BELOW_LOWER', 'NEAR_LOWER', 'OBV_BULL_DIVERGE', 'OBV_CONFIRM_BULL', 'RSI_BULL_FAIL_SWING'];
  const negative = ['OVERBOUGHT', 'BEAR_CROSS', 'BEARISH', 'HIST_TURN_DOWN', 'EMA_CROSS_DOWN', 'EMA_BEARISH', 'VOL_CONFIRM_BEAR', 'VOL_DIVERGE_WARN', 'RSI_BEAR_DIVERGENCE', 'MACD_BEAR_DIVERGENCE', 'DOUBLE_BEAR_DIVERGENCE', 'ABOVE_UPPER', 'NEAR_UPPER', 'OBV_BEAR_DIVERGE', 'OBV_CONFIRM_BEAR', 'RSI_BEAR_FAIL_SWING'];
  if (positive.includes(label)) return 'positive';
  if (negative.includes(label)) return 'negative';
  if (score !== undefined) {
    if (score >= 70) return 'positive';
    if (score <= 30) return 'negative';
  }
  return 'neutral';
}

const SIGNAL_TIPS = {
  OVERSOLD:               'RSI below 30',
  NEAR_OVERSOLD:          'RSI nearing 30',
  NEUTRAL:                'RSI mid-range',
  OVERBOUGHT:             'RSI above 70',
  BULL_CROSS:             'MACD crossed up',
  BULLISH:                'MACD above zero',
  HIST_TURN_UP:           'Histogram rising',
  HIST_TURN_DOWN:         'Histogram falling',
  BEAR_CROSS:             'MACD crossed down',
  BEARISH:                'MACD below zero',
  AT_KEY_LEVEL:           'Near key fib level',
  AT_FIB_LEVEL:           'At fib retracement',
  NEAR_FIB:               'Close to fib level',
  BETWEEN_LEVELS:         'No nearby fib',
  EMA_CROSS_UP:           'EMA bullish cross',
  EMA_BULLISH:            'Fast EMA above slow',
  EMA_CROSS_DOWN:         'EMA bearish cross',
  EMA_BEARISH:            'Fast EMA below slow',
  VOL_CONFIRM_BULL:       'Volume confirms rally',
  VOL_EXHAUSTION:         'Selling drying up',
  VOL_CONFIRM_BEAR:       'Volume confirms dump',
  VOL_DIVERGE_WARN:       'Rally on thin volume',
  RSI_BULL_DIVERGENCE:    'Price low, RSI rising',
  MACD_BULL_DIVERGENCE:   'Price low, MACD rising',
  DOUBLE_BULL_DIVERGENCE: 'RSI + MACD diverge up',
  RSI_BEAR_DIVERGENCE:    'Price high, RSI falling',
  MACD_BEAR_DIVERGENCE:   'Price high, MACD falling',
  DOUBLE_BEAR_DIVERGENCE: 'RSI + MACD diverge down',
  MIXED_DIVERGENCE:       'Conflicting signals',
  SQUEEZE:                'BB squeeze — breakout imminent',
  BELOW_LOWER:            'Below lower BB — oversold',
  NEAR_LOWER:             'Near lower BB',
  MID_BAND:               'Mid Bollinger Band',
  NEAR_UPPER:             'Near upper BB',
  ABOVE_UPPER:            'Above upper BB — extended',
  OBV_CONFIRM_BULL:       'OBV confirms uptrend',
  OBV_CONFIRM_BEAR:       'OBV confirms downtrend',
  OBV_BULL_DIVERGE:       'OBV rising, price falling',
  OBV_BEAR_DIVERGE:       'OBV falling, price rising',
  OBV_FLAT:               'OBV flat',
  RSI_BULL_FAIL_SWING:    'RSI bullish failure swing',
  RSI_BEAR_FAIL_SWING:    'RSI bearish failure swing',
};

const TA_CHIP_SIGNALS = new Set(['rsi', 'macd', 'emaCross', 'volumeTrend', 'divergence', 'bollingerBands', 'obv', 'rsiFailureSwing', 'adx']);
const _AMBIGUOUS_LABELS = new Set(['NEUTRAL', 'BULLISH', 'BEARISH', 'OVERSOLD', 'NEAR_OVERSOLD', 'OVERBOUGHT']);
const _SIGNAL_PREFIX = { rsi: 'RSI', macd: 'MACD', emaCross: 'EMA', adx: 'ADX', bollingerBands: 'BB', obv: 'OBV', volumeTrend: 'VOL', rsiFailureSwing: 'RSI', divergence: 'DIV' };

function buildSignalChips(t) {
  const breakdown = t.signalBreakdown || [];
  const chips = breakdown
    .filter(s => TA_CHIP_SIGNALS.has(s.name))
    .map(s => {
      let text = s.label ? s.label.replace(/_/g, ' ') : s.name;
      if (s.label && _AMBIGUOUS_LABELS.has(s.label)) text = `${_SIGNAL_PREFIX[s.name] || s.name} ${text}`;
      return { label: s.label || s.name, text, score: s.score };
    });
  if (t.fibonacci?.label) {
    chips.push({ label: t.fibonacci.label, text: `FIB ${t.fibonacci.label.replace(/_/g, ' ')}`, score: 50 });
  }
  if (t.chartPatterns?.patterns?.[0]?.type) {
    const p = t.chartPatterns.patterns[0];
    chips.push({ label: p.type, text: p.type.replace(/_/g, ' '), score: 50 });
  }
  return chips;
}

function getTopSignals(t) {
  const all = buildSignalChips(t);
  all.sort((a, b) => {
    const rank = s => signalChipClass(s.label, s.score) === 'positive' ? 0 : signalChipClass(s.label, s.score) === 'neutral' ? 1 : 2;
    return rank(a) - rank(b);
  });
  return all.slice(0, 3);
}

function buildMfRow(priceChange) {
  if (!priceChange) return '';
  const chips = [
    { label: '6h',  val: priceChange.h6 },
    { label: '1h',  val: priceChange.h1 },
    { label: '5m',  val: priceChange.m5 },
  ];
  const html = chips.map(c => {
    if (c.val == null) return '';
    const cls = c.val >= 0 ? 'up' : 'down';
    const sign = c.val >= 0 ? '\u25B2' : '\u25BC';
    return `<span class="card-mf-chip ${cls}">${sign}${Math.abs(c.val).toFixed(1)}% <span class="dim">${c.label}</span></span>`;
  }).join('');
  return html ? `<div class="card-mf-row">${html}</div>` : '';
}

function trendBadge(trend) {
  if (!trend || trend === 'INSUFFICIENT_DATA') return '';
  const cfg = {
    UP:       { arrow: '\u25B2', label: 'UP',   cls: 'trend-up' },
    DOWN:     { arrow: '\u25BC', label: 'DOWN', cls: 'trend-down' },
    SIDEWAYS: { arrow: '\u2015', label: 'SIDE', cls: 'trend-side' },
  };
  const t = cfg[trend];
  if (!t) return '';
  return `<span class="trend-badge ${t.cls}">${t.arrow} ${t.label}</span>`;
}

function iconHtml(icon, sym) {
  const first = (sym ?? '?')[0];
  if (icon) {
    return `<img class="token-icon" src="${icon}" alt="${sym}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="token-icon-placeholder" style="display:none">${first}</div>`;
  }
  return `<div class="token-icon-placeholder">${first}</div>`;
}

function scoreSubHtml(category) {
  const label = category?.replace('_', ' ') ?? '';
  if (!category || category === 'NEUTRAL' || category === 'AVOID') {
    return `<span class="score-sub mono">${label}</span>`;
  }
  return `<span class="score-cat-badge badge-${category}">${label}</span>`;
}

function buildCardHTML(t) {
  const change24h   = t.priceChange?.h24;
  const changeClass = (change24h ?? 0) >= 0 ? 'up' : 'down';
  const changeHtml  = change24h != null
    ? `<span class="price-change ${changeClass}">${fmtChange(change24h)}</span><span class="dim" style="font-size:var(--text-xs)">24h</span>`
    : '';

  const topSignals = getTopSignals(t);
  const signalHtml = topSignals
    .map(s => `<span class="signal-chip ${signalChipClass(s.label, s.score)}" title="${SIGNAL_TIPS[s.label] || ''}">${s.text}</span>`)
    .join('');

  const isPinned = store.isWatchlisted(t.mint);
  const category = t.category ?? 'NEUTRAL';

  const statChips = [
    t.marketCap       ? `<span class="stat-chip">MC ${fmtMCap(t.marketCap)}</span>` : '',
    t.tokenAge != null ? `<span class="stat-chip">${fmtAge(t.tokenAge)}</span>` : '',
    t.holderCount != null ? `<span class="stat-chip">${fmtHolders(t.holderCount)} hldr</span>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="card-top">
      <div class="card-top-left">
        ${iconHtml(t.icon, t.symbol)}
        <div class="token-names">
          <div class="token-name-row">
            <span class="token-name" title="${t.name ?? ''}">${t.name ?? 'Unknown'}</span>
          </div>
          <div class="token-sub-row">
            <span class="token-symbol">$${t.symbol ?? '???'}</span>
            ${t.trendingRank ? `<span class="token-rank dim">\u00b7 #${t.trendingRank}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="card-top-right">
        <button class="btn-pin${isPinned ? ' active' : ''}" data-mint="${t.mint}" title="${isPinned ? 'Unpin token' : 'Pin to watchlist'}">${SVG_PIN}</button>
        <div class="score-block">
          <span class="score-val" style="color:${scoreColor(t.compositeScore ?? 0)}">${t.compositeScore ?? 0}</span>
          ${scoreSubHtml(category)}
        </div>
        <canvas class="mini-spark" width="24" height="24"></canvas>
      </div>
    </div>

    <div class="card-stat-strip">
      ${statChips}
      ${trendBadge(t.swingPoints?.trend)}
    </div>

    <div class="card-price-row">
      <span class="token-price">${fmtPrice(t.priceUsd)}</span>
      ${changeHtml}
    </div>

    ${buildMfRow(t.priceChange)}

    ${signalHtml ? `<div class="signals-row">${signalHtml}</div>` : ''}

    <div class="card-footer">
      ${t.mint ? `<span class="token-ca" data-ca="${t.mint}" title="Click to copy CA">${t.mint.slice(0, 4)}\u2026${t.mint.slice(-4)}</span>` : ''}
    </div>
  `;
}

// ── Tracker inline analysis panel ────────────────────────────────────────────

let _selectedMint = null;
let _destroyChart = null;

function createDexScreenerChart(container, mint) {
  const iframe = document.createElement('iframe');
  iframe.src = `https://dexscreener.com/solana/${mint}?embed=1&theme=dark&trades=0&info=0`;
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('allowfullscreen', '');
  container.appendChild(iframe);

  return () => {
    iframe.src = '';
    container.innerHTML = '';
  };
}

function openTrackerChart(token) {
  const zone = document.getElementById('tracker-chart-zone');
  if (!zone) return;

  if (_destroyChart) { _destroyChart(); _destroyChart = null; }

  _selectedMint = token.mint;
  cardMap.forEach((card, mint) => card.classList.toggle('selected', mint === token.mint));

  const isPinned = store.isWatchlisted(token.mint);

  zone.innerHTML = `
    <div class="analysis-panel">
      <div class="analysis-chart-col">
        <div class="analysis-chart-container" id="analysis-chart-container"></div>
      </div>
      <div class="analysis-intel-col">
        ${buildIntelPanelHTML(token, isPinned)}
      </div>
    </div>
  `;

  zone.hidden = false;

  const container = document.getElementById('analysis-chart-container');
  if (container) {
    _destroyChart = createDexScreenerChart(container, token.mint);
  }

  wireIntelListeners(token);

  requestAnimationFrame(() => {
    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function buildIntelPanelHTML(token, isPinned) {
  const first = (token.symbol ?? '?')[0];
  const iconEl = token.icon
    ? `<img class="intel-icon" src="${token.icon}" alt="${token.symbol}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="intel-icon-placeholder" style="display:none">${first}</div>`
    : `<div class="intel-icon-placeholder">${first}</div>`;

  const score     = token.compositeScore ?? 0;
  const category  = token.category ?? 'NEUTRAL';
  const catLabel  = category.replace('_', ' ');

  const changes = [
    { label: '24h', val: token.priceChange?.h24 },
    { label: '6h',  val: token.priceChange?.h6 },
    { label: '1h',  val: token.priceChange?.h1 },
    { label: '5m',  val: token.priceChange?.m5 },
  ];
  const changeChipsHtml = changes.map(c => {
    if (c.val == null) return '';
    const cls = c.val >= 0 ? 'up' : 'down';
    const sign = c.val >= 0 ? '\u25B2' : '\u25BC';
    return `<span class="intel-change-chip ${cls}">${sign}${Math.abs(c.val).toFixed(1)}% <span class="dim">${c.label}</span></span>`;
  }).join('');

  const marketRows = [
    { label: 'MC',        value: fmtMCap(token.marketCap) },
    { label: 'Liquidity', value: token.liquidity ? fmtMCap(token.liquidity) : '--' },
    { label: 'Vol 24h',   value: token.volume?.h24 ? fmtMCap(token.volume.h24) : '--' },
    { label: 'Holders',   value: token.holderCount != null ? token.holderCount.toLocaleString() : '--' },
    { label: 'Age',       value: fmtAge(token.tokenAge) },
    { label: 'Trending',  value: token.trendingRank ? `#${token.trendingRank}` : '--' },
  ];
  const marketGridHtml = marketRows.map(r =>
    `<div class="intel-market-cell"><span class="intel-market-label">${r.label}</span><span class="intel-market-value">${r.value}</span></div>`
  ).join('');

  const allSignals = buildSignalChips(token);
  allSignals.sort((a, b) => {
    const rank = s => signalChipClass(s.label, s.score) === 'positive' ? 0 : signalChipClass(s.label, s.score) === 'neutral' ? 1 : 2;
    return rank(a) - rank(b);
  });
  const topThree = allSignals.slice(0, 3);
  const signalsHtml = topThree.length
    ? topThree.map(s => `<span class="signal-chip ${signalChipClass(s.label, s.score)}" title="${SIGNAL_TIPS[s.label] || ''}">${s.text}</span>`).join('')
    : '<span class="dim" style="font-size:var(--text-xs)">No signal data</span>';

  const taBreakdown = (token.signalBreakdown ?? [])
    .sort((a, b) => (b.normalizedWeight ?? b.weight ?? 0) - (a.normalizedWeight ?? a.weight ?? 0));

  const taBreakdownHtml = taBreakdown.map(s => {
    const barW = Math.min(s.score ?? 0, 100);
    return `
      <div class="intel-breakdown-row">
        <span class="intel-bd-name">${s.name}</span>
        <div class="intel-bd-bar-track"><div class="intel-bd-bar" style="width:${barW}%;background:${scoreColor(s.score ?? 0)}"></div></div>
        <span class="intel-bd-score">${s.score ?? 0}</span>
      </div>
    `;
  }).join('');

  const caShort = token.mint ? `${token.mint.slice(0, 6)}\u2026${token.mint.slice(-4)}` : '';

  return `
    <div class="intel-header">
      ${iconEl}
      <div class="intel-identity">
        <div class="intel-name">${token.name ?? 'Unknown'}</div>
        <div class="intel-symbol">$${token.symbol ?? '???'}</div>
        <div class="intel-ca" data-ca="${token.mint ?? ''}" title="Click to copy CA">${caShort}</div>
      </div>
      <button class="tracker-chart-close-btn" id="tracker-chart-close-btn" title="Close">\u2715</button>
    </div>

    <div class="intel-score-row">
      <span class="intel-score mono" style="color:${scoreColor(score)}">${score}</span>
      <span class="score-cat badge-${category}">${catLabel}</span>
      ${trendBadge(token.swingPoints?.trend)}
    </div>

    <div class="intel-price-row">
      <span class="token-price">${fmtPrice(token.priceUsd)}</span>
    </div>
    <div class="intel-changes">${changeChipsHtml}</div>

    <div class="intel-section">
      <div class="intel-section-title">Market Data</div>
      <div class="intel-market-grid">${marketGridHtml}</div>
    </div>

    <div class="intel-actions">
      <button class="intel-btn intel-btn-pin${isPinned ? ' active' : ''}" data-mint="${token.mint}" title="${isPinned ? 'Unpin' : 'Pin to watchlist'}">${SVG_PIN} ${isPinned ? 'Unpin' : 'Pin'}</button>
      <a class="intel-btn intel-btn-link" href="https://dexscreener.com/solana/${token.mint}" target="_blank" rel="noopener">DexScreener \u2197</a>
      <a class="intel-btn intel-btn-link" href="https://birdeye.so/token/${token.mint}?chain=solana" target="_blank" rel="noopener">Birdeye \u2197</a>
    </div>

    <div class="intel-section">
      <div class="intel-section-title">Top Signals</div>
      <div class="intel-signals">${signalsHtml}</div>
    </div>

    ${taBreakdownHtml ? `
      <div class="intel-section">
        <div class="intel-section-title intel-toggle" onclick="var bd=this.nextElementSibling;bd.style.display=bd.style.display==='none'?'flex':'none';this.classList.toggle('open')">Signal Breakdown <span class="intel-caret">&#9656;</span></div>
        <div class="intel-breakdown" style="display:none">
          ${taBreakdownHtml}
        </div>
      </div>
    ` : ''}
  `;
}

function wireIntelListeners(token) {
  document.getElementById('tracker-chart-close-btn')
    ?.addEventListener('click', closeTrackerChart);

  const zone = document.getElementById('tracker-chart-zone');
  if (!zone) return;

  // Pin button
  const pinBtn = zone.querySelector('.intel-btn-pin');
  if (pinBtn) {
    pinBtn.onclick = async (e) => {
      e.stopPropagation();
      const mint = pinBtn.dataset.mint;
      if (store.isWatchlisted(mint)) {
        await store.removeFromWatchlist(mint);
      } else {
        await store.addToWatchlist(mint);
      }
      const cached = store.get(mint);
      if (cached) {
        upsertCard(cached);
        const intelCol = zone.querySelector('.analysis-intel-col');
        if (intelCol) {
          intelCol.innerHTML = buildIntelPanelHTML(cached, store.isWatchlisted(mint));
          wireIntelListeners(cached);
        }
      }
    };
  }

  // CA click-to-copy
  const caEl = zone.querySelector('.intel-ca');
  if (caEl) {
    caEl.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(caEl.dataset.ca).then(() => {
        const orig = caEl.textContent;
        caEl.textContent = 'copied!';
        caEl.classList.add('copied');
        setTimeout(() => { caEl.textContent = orig; caEl.classList.remove('copied'); }, 1500);
      });
    };
  }
}

export function updateSelectedChart(token) {
  if (!_selectedMint || _selectedMint !== token.mint) return;

  const zone = document.getElementById('tracker-chart-zone');
  if (!zone || zone.hidden) return;

  const intelCol = zone.querySelector('.analysis-intel-col');
  if (intelCol) {
    const isPinned = store.isWatchlisted(token.mint);
    intelCol.innerHTML = buildIntelPanelHTML(token, isPinned);
    wireIntelListeners(token);
  }
}

function closeTrackerChart() {
  const zone = document.getElementById('tracker-chart-zone');
  if (_destroyChart) { _destroyChart(); _destroyChart = null; }
  if (zone) { zone.innerHTML = ''; zone.hidden = true; }
  _selectedMint = null;
  cardMap.forEach(card => card.classList.remove('selected'));
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _selectedMint) closeTrackerChart();
});

/**
 * Upsert a single token card.
 */
export function upsertCard(token) {
  removeSkeletons();
  const existing = cardMap.get(token.mint);
  const watchlistClass = token.isWatchlist ? ' watchlist' : '';
  const category = token.category ?? 'NEUTRAL';

  if (existing) {
    existing.className = `token-card ${category}${watchlistClass}`;
    existing.innerHTML = buildCardHTML(token);
  } else {
    const card = document.createElement('div');
    card.className = `token-card ${category}${watchlistClass}`;
    card.dataset.mint = token.mint;
    card.innerHTML = buildCardHTML(token);
    cardMap.set(token.mint, card);
    grid.appendChild(card);
  }

  const card = cardMap.get(token.mint);

  // Draw mini sparkline
  const miniCanvas = card.querySelector('.mini-spark');
  if (miniCanvas && token.candles) {
    drawMiniSparkline(miniCanvas, token.candles, token.category);
  }

  // Wire pin button
  const pinBtn = card.querySelector('.btn-pin');
  if (pinBtn) {
    pinBtn.onclick = async (e) => {
      e.stopPropagation();
      const mint = pinBtn.dataset.mint;
      if (store.isWatchlisted(mint)) {
        await store.removeFromWatchlist(mint);
      } else {
        await store.addToWatchlist(mint);
      }
      const cached = store.get(mint);
      if (cached) upsertCard(cached);
    };
  }

  // Open inline chart zone on card click
  card.onclick = (e) => {
    if (e.target.closest('.btn-pin, .token-ca')) return;
    if (_selectedMint === token.mint) {
      closeTrackerChart();
    } else {
      openTrackerChart(token);
    }
  };

  // Wire click-to-copy on CA chip
  const caEl = card.querySelector('.token-ca');
  if (caEl) {
    caEl.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(caEl.dataset.ca).then(() => {
        const orig = caEl.textContent;
        caEl.textContent = 'copied!';
        caEl.classList.add('copied');
        setTimeout(() => {
          caEl.textContent = orig;
          caEl.classList.remove('copied');
        }, 1500);
      });
    };
  }

  hideEmpty();
}

/**
 * Re-render all visible cards in sorted/filtered order.
 */
export function renderAll(tokens) {
  const visibleMints = new Set(tokens.map(t => t.mint));
  for (const [mint, card] of cardMap) {
    if (!visibleMints.has(mint)) {
      card.remove();
      cardMap.delete(mint);
    }
  }

  tokens.forEach((token, i) => {
    upsertCard(token);
    const card = cardMap.get(token.mint);
    if (card) {
      const children = Array.from(grid.children).filter(c => c.classList.contains('token-card'));
      if (children[i] !== card) grid.insertBefore(card, children[i] ?? null);
    }
  });

  if (tokens.length === 0) showEmpty();
  else hideEmpty();
}

const DEFAULT_EMPTY_HTML = emptyState?.innerHTML ?? '';

export function setEmptyMessage(html) {
  if (!emptyState) return;
  emptyState.innerHTML = html;
  emptyState.style.display = 'flex';
}

export function resetEmptyMessage() {
  if (!emptyState) return;
  emptyState.innerHTML = DEFAULT_EMPTY_HTML;
}

function showEmpty() {
  if (emptyState) emptyState.style.display = 'flex';
}

function hideEmpty() {
  if (emptyState) emptyState.style.display = 'none';
}
