/**
 * Skin Manager — Radar is the only active skin.
 * Terminal and War Room are paused (files exist but disconnected).
 */

let _active = 'scanner';

/* ── Public API ────────────────────────────────────────────────────────────── */

export function getSkin() { return _active; }
export function setSkin() {}  // no-op — single skin

export function init() {
  _active = 'scanner';
  document.body.setAttribute('data-skin', 'scanner');

  // Hide switcher button — single skin, no need
  const btn = document.getElementById('skin-switcher');
  if (btn) btn.style.display = 'none';
}
