'use strict';

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'watchlist.json');

/** Normalize mint to lowercase — prevents casing mismatches creating duplicate watchlist entries */
function _norm(mint) {
  return typeof mint === 'string' ? mint.toLowerCase() : mint;
}

/** @type {Set<string>} lowercased keys for dedup */
let _keys = new Set();
/** @type {Map<string, string>} lowercase → original-case mint */
let _originals = new Map();

// Load persisted list on startup
try {
  const raw = fs.readFileSync(FILE, 'utf8');
  const data = JSON.parse(raw);
  if (Array.isArray(data.mints)) {
    for (const m of data.mints) {
      const key = _norm(m);
      _keys.add(key);
      _originals.set(key, m); // preserve whatever case was persisted
    }
  }
} catch {
  // File doesn't exist yet — start empty
}

function _persist() {
  // Persist original-case mints
  fs.writeFileSync(FILE, JSON.stringify({ mints: Array.from(_originals.values()) }, null, 2), 'utf8');
}

function add(mint) {
  if (!mint) return;
  const key = _norm(mint);
  _keys.add(key);
  // Only store original case on first add — don't overwrite with a lowered version
  if (!_originals.has(key)) _originals.set(key, mint);
  _persist();
}

function remove(mint) {
  const key = _norm(mint);
  _keys.delete(key);
  _originals.delete(key);
  _persist();
}

function has(mint) {
  return _keys.has(_norm(mint));
}

function all() {
  return Array.from(_originals.values());
}

module.exports = { add, remove, has, all };
