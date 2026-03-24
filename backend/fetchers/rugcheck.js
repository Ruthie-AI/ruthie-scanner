'use strict';

const config = require('../config');
const logger = require('../utils/logger');

const TIMEOUT_MS = 4_000;

async function fetchReport(mint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${config.rugcheck.baseUrl}/v1/tokens/${mint}/report/summary`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (typeof data.score !== 'number') return null;
    return { score: data.score, risks: Array.isArray(data.risks) ? data.risks : [] };
  } catch (err) {
    logger.warn(`[rugcheck] ${mint.slice(0, 8)}: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchReport };
