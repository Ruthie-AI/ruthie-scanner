'use strict';

// STUB — Phase 2 will implement real Helius RPC calls.
// Currently returns null so the scoring engine skips holder/age from this source.

const logger = require('../utils/logger');

/**
 * Fetch on-chain asset info for a mint via Helius getAsset.
 * @param {string} _mint
 * @returns {Promise<null>}
 */
async function fetchAsset(_mint) {
  // TODO Phase 2: implement Helius getAsset RPC call
  return null;
}

module.exports = { fetchAsset };
