/**
 * Client-side token store.
 * Client-side token store for the scanner.
 */

/** Normalize mint to lowercase */
const _norm = m => typeof m === 'string' ? m.toLowerCase() : m;

/** @type {Map<string, object>} */
const _store = new Map();

/** @type {Set<string>} */
const _watchlist = new Set();

export function upsert(payload) {
  _store.set(_norm(payload.mint), payload);
}

export function get(mint) {
  return _store.get(_norm(mint)) ?? null;
}

export function has(mint) {
  return _store.has(_norm(mint));
}

export function remove(mint) {
  _store.delete(_norm(mint));
}

export function all() {
  return Array.from(_store.values());
}

/**
 * Return all tokens matching filter state, sorted.
 * @param {{ minScore: number, categories: string[], sort: string, search: string }} filterState
 */
export function filtered(filterState) {
  const { minScore = 0, categories = [], sort = 'score', search = '' } = filterState;

  const showWatchlist = categories.includes('WATCHLIST');
  const scoreCategories = categories.filter(c => c !== 'WATCHLIST');

  let tokens = all().filter(t => {
    if (search) {
      const nameMatch   = t.name?.toLowerCase().includes(search);
      const symbolMatch = t.symbol?.toLowerCase().includes(search);
      const mintMatch   = t.mint?.toLowerCase().includes(search);
      return nameMatch || symbolMatch || mintMatch;
    }
    if (t.isWatchlist) return showWatchlist && (t.compositeScore ?? 0) >= minScore;
    if ((t.compositeScore ?? 0) < minScore) return false;
    if (!scoreCategories.includes(t.category)) return false;
    return true;
  });

  tokens.sort((a, b) => {
    if (sort === 'trending')  return (a.trendingRank ?? 999) - (b.trendingRank ?? 999);
    if (sort === 'age')       return (a.tokenAge ?? 9999) - (b.tokenAge ?? 9999);
    if (sort === 'marketCap') return (b.marketCap ?? 0) - (a.marketCap ?? 0);
    // Default: composite score descending
    return (b.compositeScore ?? 0) - (a.compositeScore ?? 0);
  });

  return tokens;
}

export function size() {
  return _store.size;
}

// ── Snapshot purge ────────────────────────────────────────────────────────────

let _snapshotMints = null;

export function snapshotStart() {
  _snapshotMints = new Set();
}

export function snapshotTrack(mint) {
  if (_snapshotMints) _snapshotMints.add(_norm(mint));
}

export function snapshotEnd() {
  if (!_snapshotMints) return 0;
  let removed = 0;
  for (const mint of _store.keys()) {
    if (!_snapshotMints.has(mint)) {
      _store.delete(mint);
      removed++;
    }
  }
  _snapshotMints = null;
  return removed;
}

// ── Watchlist ──────────────────────────────────────────────────────────────────

export function isWatchlisted(mint) {
  return _watchlist.has(_norm(mint));
}

export function hydrateWatchlist(mints) {
  _watchlist.clear();
  for (const m of mints) _watchlist.add(_norm(m));
}

export async function addToWatchlist(mint) {
  const res = await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mint }),
  });
  if (res.ok) _watchlist.add(_norm(mint));
}

export async function removeFromWatchlist(mint) {
  const res = await fetch(`/api/watchlist/${mint}`, { method: 'DELETE' });
  if (res.ok) _watchlist.delete(_norm(mint));
}
