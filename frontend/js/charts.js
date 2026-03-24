/**
 * Canvas 2D sparklines for token cards.
 */

const CATEGORY_COLORS = {
  STRONG_BUY: '#00e676',
  BUY:        '#69f0ae',
  EXHAUSTED:  '#ffab40',
  WATCH:      '#ffd740',
  NEUTRAL:    '#5a7a68',
  AVOID:      '#ef5350',
};

/**
 * Draw a sparkline for a token's candle data onto a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {object[]} candles  — normalized OHLCV, oldest first
 * @param {string} category   — used for color
 */
export function drawSparkline(canvas, candles, category) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  if (!candles || candles.length < 2) {
    // Draw flat line placeholder
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    return;
  }

  // Build a price series: each candle's open (which reflects its time window's
  // starting price), then the final close. All closes are identical in the
  // synthetic candle set, so using only closes gives a flat line.
  const prices = [
    ...candles.map(c => c.open),
    candles[candles.length - 1].close,
  ].filter(v => v > 0);

  if (prices.length < 2) return;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || min * 0.01 || 1;

  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const color = colorForCategory(category);

  // Build gradient
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, color + '44');
  grad.addColorStop(1, color + '00');

  // Path
  const points = prices.map((v, i) => ({
    x: pad + (i / (prices.length - 1)) * w,
    y: pad + h - ((v - min) / range) * h,
  }));

  // Fill
  ctx.beginPath();
  ctx.moveTo(points[0].x, height);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, height);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function colorForCategory(cat) {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.NEUTRAL;
}

/**
 * Draw a mini sparkline (24×24) — line only, no gradient fill.
 * @param {HTMLCanvasElement} canvas
 * @param {object[]} candles — normalized OHLCV, oldest first
 * @param {string} category — used for color
 */
export function drawMiniSparkline(canvas, candles, category) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  if (!candles || candles.length < 2) return;

  const prices = [
    ...candles.map(c => c.open),
    candles[candles.length - 1].close,
  ].filter(v => v > 0);

  if (prices.length < 2) return;

  const min   = Math.min(...prices);
  const max   = Math.max(...prices);
  const range = max - min || min * 0.01 || 1;

  const pad = 2;
  const w   = width - pad * 2;
  const h   = height - pad * 2;

  const color  = colorForCategory(category);
  const points = prices.map((v, i) => ({
    x: pad + (i / (prices.length - 1)) * w,
    y: pad + h - ((v - min) / range) * h,
  }));

  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/**
 * Compute score bar gradient color (red → yellow → green).
 * @param {number} score 0–100
 */
export function scoreColor(score) {
  if (score >= 90) return CATEGORY_COLORS.STRONG_BUY;
  if (score >= 75) return CATEGORY_COLORS.BUY;
  if (score >= 60) return CATEGORY_COLORS.WATCH;
  if (score >= 40) return CATEGORY_COLORS.NEUTRAL;
  return CATEGORY_COLORS.AVOID;
}

