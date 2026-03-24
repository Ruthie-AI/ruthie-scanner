'use strict';

const fs     = require('fs');
const path   = require('path');
const logger = require('./logger');
const config = require('../config');

const PERSIST_PATH = path.join(__dirname, '..', 'logs', 'cu-usage.json');
const HISTORY_PATH = path.join(__dirname, '..', 'logs', 'cu-usage-history.json');

let _today  = '';   // 'YYYY-MM-DD' UTC
let _spent  = 0;
let _warned = { 75: false, 95: false, 100: false };

/** Load persisted state (survives server restarts mid-day). */
function _load() {
  try {
    if (!fs.existsSync(PERSIST_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(PERSIST_PATH, 'utf8'));
    const today = _utcDate();
    if (raw.date === today) {
      _today = today;
      _spent = raw.spent || 0;
      logger.info(`CU budget restored: ${_spent} spent today (${usagePct().toFixed(1)}%)`);
    } else {
      // Day rolled — archive yesterday's final spend before resetting
      _archiveDay(raw.date, raw.spent || 0);
      logger.info('CU budget: new day — counter reset');
    }
  } catch {
    // Corrupted file — start fresh
  }
}

/** Persist current state to disk. */
function _save() {
  try {
    fs.writeFileSync(PERSIST_PATH, JSON.stringify({ date: _today, spent: _spent }, null, 2));
  } catch (err) {
    logger.warn('CU budget persist failed:', err.message);
  }
}

/** Current UTC date as 'YYYY-MM-DD'. */
function _utcDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Archive a completed day's spend to the rolling history log.
 * @param {string} date — 'YYYY-MM-DD'
 * @param {number} spent — total CU spent that day
 */
function _archiveDay(date, spent) {
  if (!date || spent <= 0) return;
  try {
    let history = [];
    if (fs.existsSync(HISTORY_PATH)) {
      try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); } catch { history = []; }
    }
    // Don't duplicate if already archived
    if (history.some(h => h.date === date)) return;
    history.push({
      date,
      spent,
      budget: config.birdeye.cuDailyBudget,
      pct: parseFloat(((spent / config.birdeye.cuDailyBudget) * 100).toFixed(1)),
    });
    // Keep last 60 days
    if (history.length > 60) history = history.slice(-60);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    logger.info(`CU history: archived ${date} → ${spent} CU (${((spent / config.birdeye.cuDailyBudget) * 100).toFixed(1)}%)`);
  } catch (err) {
    logger.warn('CU history archive failed:', err.message);
  }
}

/** Reset counter if the day rolled over. */
function _maybeReset() {
  const today = _utcDate();
  if (_today !== today) {
    // Archive the finishing day before resetting
    if (_today && _spent > 0) _archiveDay(_today, _spent);
    if (_today) logger.info(`CU budget: day rolled over (${_today} → ${today}) — counter reset`);
    _today = today;
    _spent = 0;
    _warned = { 75: false, 95: false, 100: false };
    _save();
  }
}

/** Check threshold crossings and log warnings (once per crossing). */
function _checkThresholds() {
  const pct = usagePct();
  if (pct >= 100 && !_warned[100]) {
    logger.warn(`CU BUDGET EXHAUSTED — ${_spent} / ${config.birdeye.cuDailyBudget} (${pct.toFixed(1)}%). Birdeye calls blocked until midnight UTC.`);
    _warned[100] = true;
  } else if (pct >= 95 && !_warned[95]) {
    logger.warn(`CU budget critical — ${_spent} / ${config.birdeye.cuDailyBudget} (${pct.toFixed(1)}%). Reduced mode: watchlist + open positions only.`);
    _warned[95] = true;
  } else if (pct >= 75 && !_warned[75]) {
    logger.warn(`CU budget 75% — ${_spent} / ${config.birdeye.cuDailyBudget} (${pct.toFixed(1)}%).`);
    _warned[75] = true;
  }
}

/** Can we afford to spend `cu` units? Always returns true — monitoring only, no restriction. */
function canSpend(cu) {
  _maybeReset();
  return true;
}

/** Record CU spend after a successful API call. */
function spend(cu) {
  _maybeReset();
  _spent += cu;
  _checkThresholds();
  _save();
}

/** Remaining CU for today. */
function remaining() {
  _maybeReset();
  return Math.max(0, config.birdeye.cuDailyBudget - _spent);
}

/** Current usage as a percentage (0–100+). */
function usagePct() {
  _maybeReset();
  return (config.birdeye.cuDailyBudget > 0)
    ? (_spent / config.birdeye.cuDailyBudget) * 100
    : 0;
}

/**
 * Budget level — monitoring only, never restricts.
 * Logs warnings at thresholds but always returns 'normal'.
 */
function budgetLevel() {
  return 'normal';
}

/**
 * Read the CU usage history log.
 * @returns {object[]} — array of { date, spent, budget, pct }
 */
function getHistory() {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return [];
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch { return []; }
}

// Load on require
_load();

module.exports = { canSpend, spend, remaining, usagePct, budgetLevel, getHistory };
