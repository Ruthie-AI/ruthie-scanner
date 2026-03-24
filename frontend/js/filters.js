/**
 * Sidebar filter state + change notification.
 */

/** @type {{ minScore: number, categories: string[], sort: string, search: string }} */
let state = {
  minScore:   0,
  categories: ['STRONG_BUY', 'EXHAUSTED', 'BUY', 'WATCH', 'NEUTRAL', 'AVOID', 'WATCHLIST'],
  sort:       'score',
  search:     '',
};

const listeners = [];

export function getState() {
  return { ...state, categories: [...state.categories] };
}

export function onChange(fn) {
  listeners.push(fn);
}

function notify() {
  for (const fn of listeners) fn(getState());
}

export function clearSearch() {
  const searchInput = document.getElementById('filter-search');
  const fbSearch = document.getElementById('fb-search');
  if (searchInput) searchInput.value = '';
  if (fbSearch) fbSearch.value = '';
  state.search = '';
  notify();
}

export function init() {
  // ── Sidebar controls ──────────────────────────────────────────────────────
  const searchInput = document.getElementById('filter-search');
  const scoreSlider = document.getElementById('filter-min-score');
  const scoreVal    = document.getElementById('filter-min-score-val');
  const catBoxes    = document.querySelectorAll('.filter-cat');
  const sortSelect  = document.getElementById('filter-sort');

  // ── Filter bar controls (Scanner skin) ────────────────────────────────────
  const fbSearch   = document.getElementById('fb-search');
  const fbScore    = document.getElementById('fb-score');
  const fbScoreVal = document.getElementById('fb-score-val');
  const fbCats     = document.getElementById('fb-cats');
  const fbSort     = document.getElementById('fb-sort');
  const fbToggle   = document.getElementById('fb-toggle');
  const fbControls = document.getElementById('fb-controls');
  const filterBar  = document.getElementById('filter-bar');

  // ── Sync helpers: keep sidebar + filter-bar in lock-step ──────────────────
  function syncSearchToBar()     { if (fbSearch) fbSearch.value = state.search; }
  function syncSearchToSidebar() { if (searchInput) searchInput.value = state.search; }
  function syncScoreToBar()      { if (fbScore) fbScore.value = state.minScore; if (fbScoreVal) fbScoreVal.textContent = state.minScore; }
  function syncScoreToSidebar()  { if (scoreSlider) scoreSlider.value = state.minScore; if (scoreVal) scoreVal.textContent = state.minScore; }
  function syncSortToBar()       { if (fbSort) fbSort.value = state.sort; }
  function syncSortToSidebar()   { if (sortSelect) sortSelect.value = state.sort; }

  function syncCatsToBar() {
    if (!fbCats) return;
    fbCats.querySelectorAll('.fb-cat-pill').forEach(btn => {
      btn.classList.toggle('active', state.categories.includes(btn.dataset.cat));
    });
  }
  function syncCatsToSidebar() {
    catBoxes.forEach(cb => { cb.checked = state.categories.includes(cb.value); });
    syncAllBox();
  }

  // ── Sidebar event wiring ──────────────────────────────────────────────────
  searchInput?.addEventListener('input', () => {
    state.search = searchInput.value.trim().toLowerCase();
    syncSearchToBar();
    notify();
  });

  scoreSlider?.addEventListener('input', () => {
    state.minScore = parseInt(scoreSlider.value, 10);
    if (scoreVal) scoreVal.textContent = state.minScore;
    syncScoreToBar();
    notify();
  });

  const allBox = document.getElementById('filter-cat-all');

  function syncAllBox() {
    if (!allBox) return;
    const total = catBoxes.length;
    const checked = Array.from(catBoxes).filter(c => c.checked).length;
    allBox.checked = checked === total;
    allBox.indeterminate = checked > 0 && checked < total;
  }

  catBoxes.forEach(cb => {
    cb.addEventListener('change', () => {
      state.categories = Array.from(catBoxes)
        .filter(c => c.checked)
        .map(c => c.value);
      syncAllBox();
      syncCatsToBar();
      notify();
    });
  });

  allBox?.addEventListener('change', () => {
    catBoxes.forEach(cb => { cb.checked = allBox.checked; });
    state.categories = allBox.checked
      ? Array.from(catBoxes).map(c => c.value)
      : [];
    allBox.indeterminate = false;
    syncCatsToBar();
    notify();
  });

  sortSelect?.addEventListener('change', () => {
    state.sort = sortSelect.value;
    syncSortToBar();
    notify();
  });

  // ── Filter bar event wiring (Scanner skin) ────────────────────────────────
  fbSearch?.addEventListener('input', () => {
    state.search = fbSearch.value.trim().toLowerCase();
    syncSearchToSidebar();
    notify();
  });

  fbScore?.addEventListener('input', () => {
    state.minScore = parseInt(fbScore.value, 10);
    if (fbScoreVal) fbScoreVal.textContent = state.minScore;
    syncScoreToSidebar();
    notify();
  });

  fbCats?.addEventListener('click', (e) => {
    const pill = e.target.closest('.fb-cat-pill');
    if (!pill) return;
    pill.classList.toggle('active');
    state.categories = Array.from(fbCats.querySelectorAll('.fb-cat-pill.active'))
      .map(p => p.dataset.cat);
    syncCatsToSidebar();
    notify();
  });

  fbSort?.addEventListener('change', () => {
    state.sort = fbSort.value;
    syncSortToSidebar();
    notify();
  });

  // Collapse toggle
  fbToggle?.addEventListener('click', () => {
    filterBar?.classList.toggle('collapsed');
    fbToggle.textContent = filterBar?.classList.contains('collapsed') ? 'Filters ▸' : 'Filters';
  });
}
