/**
 * Shared formatter utilities for the frontend.
 */

export function fmtPrice(price) {
  if (price == null || price === 0) return '--';
  if (price < 0.000001) return `$${price.toExponential(3)}`;
  if (price < 0.01)     return `$${price.toFixed(6)}`;
  if (price < 1)        return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}
