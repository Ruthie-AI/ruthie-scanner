'use strict';

const { calcRsiFailureSwing } = require('../backend/analysis/rsi-failure-swing');

describe('calcRsiFailureSwing', () => {
  test('returns INSUFFICIENT_DATA with null input', () => {
    const result = calcRsiFailureSwing(null);
    expect(result.label).toBe('INSUFFICIENT_DATA');
    expect(result.bullish).toBe(false);
    expect(result.bearish).toBe(false);
  });

  test('returns INSUFFICIENT_DATA with empty _allValues', () => {
    const result = calcRsiFailureSwing({ _allValues: [] });
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('returns INSUFFICIENT_DATA with < 5 values', () => {
    const result = calcRsiFailureSwing({ _allValues: [45, 50, 55, 60] });
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  test('detects bullish failure swing', () => {
    // Step 1: RSI drops below 30 (oversold)
    // Step 2: RSI bounces above 30
    // Step 3: RSI pulls back but stays above 30
    // Step 4: RSI breaks above the bounce peak
    const rsi = {
      _allValues: [
        45, 35, 25,  // drop below 30
        32, 38, 42,  // bounce above 30, peak at 42
        35,          // pullback, stays above 30
        45,          // breaks above 42 → confirmed
      ],
    };
    const result = calcRsiFailureSwing(rsi);
    expect(result.bullish).toBe(true);
    expect(result.label).toBe('RSI_BULL_FAIL_SWING');
  });

  test('detects bearish failure swing', () => {
    // Mirror of bullish:
    // Step 1: RSI rises above 70 (overbought)
    // Step 2: RSI drops below 70
    // Step 3: RSI rallies but stays below 70
    // Step 4: RSI breaks below the drop trough
    const rsi = {
      _allValues: [
        55, 65, 75,  // rise above 70
        68, 62, 58,  // drop below 70, trough at 58
        65,          // rally, stays below 70
        55,          // breaks below 58 → confirmed
      ],
    };
    const result = calcRsiFailureSwing(rsi);
    expect(result.bearish).toBe(true);
    expect(result.label).toBe('RSI_BEAR_FAIL_SWING');
  });

  test('returns NONE when no pattern present', () => {
    const rsi = {
      _allValues: [45, 50, 55, 50, 45, 50, 55, 50, 45, 50],
    };
    const result = calcRsiFailureSwing(rsi);
    expect(result.bullish).toBe(false);
    expect(result.bearish).toBe(false);
    expect(result.label).toBe('NONE');
  });

  test('bullish takes priority over bearish', () => {
    // Both patterns present in same window — bullish is checked first in label
    const rsi = {
      _allValues: [
        75, 68, 62, 65, 55,   // bearish failure swing: above 70, drop, rally, break
        25, 32, 38, 35, 45,   // bullish failure swing: below 30, bounce, pullback, break
      ],
    };
    const result = calcRsiFailureSwing(rsi);
    // Bullish takes priority
    expect(result.bullish).toBe(true);
    expect(result.label).toBe('RSI_BULL_FAIL_SWING');
  });

  test('fails when pullback drops below oversold', () => {
    // Incomplete: RSI drops below 30, bounces, but pullback goes below 30 again
    const rsi = {
      _allValues: [
        45, 35, 25,  // drop below 30
        32, 38,      // bounce above 30
        28,          // pullback goes below 30 — pattern fails
        35, 40,      // no break above prior peak in valid state
      ],
    };
    const result = calcRsiFailureSwing(rsi);
    // The state machine restarts after hitting 28 (below oversold)
    // Then 35, 40 don't form a complete new pattern
    // The new pattern from 28: bounce at 32(35), pull at 35(oops 40>35 breaks) — wait,
    // after restart at 28, next is 35 (above 30, bounce peak=35), then 40 > 35 = confirmed
    // Actually this DOES form a second bullish failure swing!
    // 28 → below oversold, 35 → bounce (peak=35), 40 > 35? No, we need a pullback first.
    // 28 is GOT_OVERSOLD, 35 is GOT_BOUNCE (peak=35), 40 > 35 → peak updates to 40.
    // No pullback between, so not confirmed.
    expect(result.bullish).toBe(false);
  });

  test('bearish fails when rally goes above overbought', () => {
    const rsi = {
      _allValues: [
        55, 65, 75,  // rise above 70
        68, 62,      // drop below 70
        72,          // rally goes above 70 — pattern fails, restarts
        50, 45,
      ],
    };
    const result = calcRsiFailureSwing(rsi);
    expect(result.bearish).toBe(false);
  });

  test('works with exactly 5 RSI values', () => {
    const rsi = {
      _allValues: [25, 35, 42, 38, 45], // bullish: below 30, bounce, peak 42, pull to 38, break 45
    };
    const result = calcRsiFailureSwing(rsi);
    expect(result.bullish).toBe(true);
    expect(result.label).toBe('RSI_BULL_FAIL_SWING');
  });

  test('scans only last 20 values', () => {
    // Pattern in the old part (before last 20) should not trigger
    const old = [25, 35, 42, 38, 45]; // bullish pattern
    const neutral = Array(20).fill(50); // 20 neutral values
    const rsi = {
      _allValues: [...old, ...neutral],
    };
    const result = calcRsiFailureSwing(rsi);
    // Only last 20 values are scanned — all 50s, no pattern
    expect(result.bullish).toBe(false);
    expect(result.label).toBe('NONE');
  });
});
