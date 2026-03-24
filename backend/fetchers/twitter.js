'use strict';

// STUB — X/Twitter signals. Weight is 0 in config.js until API key is added.
// Phase 3 will implement mention count, sentiment, influencer detection.

/**
 * Fetch X/Twitter signals for a token symbol.
 * @param {string} _symbol
 * @returns {Promise<null>}  null = signal excluded from scoring
 */
async function fetchSignals(_symbol) {
  // TODO Phase 3: X API v2 recent-search, sentiment scoring
  return null;
}

module.exports = { fetchSignals };
