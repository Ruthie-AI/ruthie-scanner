/**
 * WebSocket client with auto-reconnect + Brain-down detection.
 * Public scanner build — token updates, alerts, status only.
 *
 * Dispatches CustomEvents on `window`:
 *   - 'ws:token:update'  — payload: TokenPayload
 *   - 'ws:token:remove'  — payload: { mint }
 *   - 'ws:alert'         — payload: alert data
 *   - 'ws:status'        — payload: server status
 *   - 'ws:connected'
 *   - 'ws:disconnected'
 *   - 'ws:brain:down'    — no data for 30s
 *   - 'ws:brain:up'      — data flowing again
 */

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY = 30_000;
const BRAIN_DOWN_TIMEOUT = 30_000;

let ws = null;
let reconnectDelay = RECONNECT_DELAY_MS;
let reconnectTimer = null;
let brainDownTimer = null;
let brainIsDown = false;

function getWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function resetBrainDownTimer() {
  clearTimeout(brainDownTimer);
  if (brainIsDown) {
    brainIsDown = false;
    dispatch('ws:brain:up');
  }
  brainDownTimer = setTimeout(() => {
    brainIsDown = true;
    dispatch('ws:brain:down');
  }, BRAIN_DOWN_TIMEOUT);
}

function connect() {
  if (ws) {
    try { ws.close(); } catch {}
  }

  ws = new WebSocket(getWsUrl());

  ws.addEventListener('open', () => {
    reconnectDelay = RECONNECT_DELAY_MS;
    dispatch('ws:connected');
    resetBrainDownTimer();
    ws.send(JSON.stringify({ type: 'snapshot:request' }));
  });

  ws.addEventListener('message', (event) => {
    resetBrainDownTimer();
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    const { type, payload } = msg;
    if (type === 'snapshot:start')       dispatch('ws:snapshot:start');
    else if (type === 'snapshot:end')    dispatch('ws:snapshot:end');
    else if (type === 'token:update')    dispatch('ws:token:update',  payload);
    else if (type === 'token:remove')    dispatch('ws:token:remove',  payload);
    else if (type === 'alert')           dispatch('ws:alert',         payload);
    else if (type === 'status')          dispatch('ws:status',        payload);
  });

  ws.addEventListener('close', () => {
    clearTimeout(brainDownTimer);
    dispatch('ws:disconnected');
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    // 'close' fires after 'error', so reconnect is handled there
  });
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connect();
    reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
  }, reconnectDelay);
}

export function init() {
  connect();
}
