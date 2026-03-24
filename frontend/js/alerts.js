/**
 * Alert system — Browser Notification API + in-app toasts.
 */

const toastContainer = document.getElementById('toast-container');
let notificationsEnabled = false;

/** Client-side alert cooldown: mint → timestamp */
const alertCooldown = new Map();
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export function init() {
  const btn = document.getElementById('btn-notify');
  btn?.addEventListener('click', async () => {
    if (notificationsEnabled) {
      notificationsEnabled = false;
      btn.textContent = 'Enable Alerts';
      btn.classList.remove('enabled');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      notificationsEnabled = true;
      btn.textContent = 'Alerts On ✓';
      btn.classList.add('enabled');
    } else {
      showToast('Alerts', 'Browser blocked notifications. Check your site permissions.', 'NEUTRAL');
    }
  });
}

/**
 * Handle an alert from the server.
 * @param {{ mint, name, symbol, score, category }} alert
 */
export function handleAlert(alert) {
  // Client-side dedup
  const last = alertCooldown.get(alert.mint) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) return;
  alertCooldown.set(alert.mint, Date.now());

  const title = `$${alert.symbol} — Score ${alert.score}`;
  const body  = `${alert.name} — ${alert.category}`;

  // Browser notification
  if (notificationsEnabled && Notification.permission === 'granted') {
    new Notification(title, { body, tag: alert.mint });
  }

  // In-app toast
  showToast(title, body, alert.category);
}

/**
 * Show an in-app toast notification.
 */
export function showToast(title, body, category = 'NEUTRAL') {
  const toast = document.createElement('div');
  toast.className = `toast ${category}`;
  toast.innerHTML = `
    <div class="toast-inner">
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-body">${body}</div>
      </div>
    </div>
  `;

  toastContainer?.appendChild(toast);

  // Auto-dismiss after 6 seconds
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, 6000);
}
