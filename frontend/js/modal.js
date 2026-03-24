/**
 * Modal system — styled replacement for window.prompt().
 */

/**
 * Show a buy modal with SOL amount and optional note inputs.
 * @param {number} defaultSol — pre-filled SOL amount (from strategy)
 * @returns {Promise<{amountSol: number, manualNote: string}|null>} — result or null if cancelled
 */
export function showBuyModal(defaultSol = 1.5) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">Manual Buy</div>
        <div class="modal-field">
          <label class="modal-label">SOL Amount</label>
          <input class="modal-input-sol" type="number" step="0.1" min="0.01" value="${defaultSol}" autocomplete="off" />
        </div>
        <div class="modal-field">
          <label class="modal-label">Note (optional)</label>
          <input class="modal-input" type="text" placeholder="e.g. chart looks bullish…" autocomplete="off" />
        </div>
        <div class="modal-actions">
          <button class="modal-btn modal-btn-cancel">Cancel</button>
          <button class="modal-btn modal-btn-confirm">Confirm</button>
        </div>
      </div>
    `;

    const solInput   = overlay.querySelector('.modal-input-sol');
    const noteInput  = overlay.querySelector('.modal-input');
    const cancelBtn  = overlay.querySelector('.modal-btn-cancel');
    const confirmBtn = overlay.querySelector('.modal-btn-confirm');

    function close(value) {
      overlay.remove();
      resolve(value);
    }

    function confirm() {
      const amountSol = parseFloat(solInput.value);
      if (!amountSol || amountSol <= 0) {
        solInput.style.borderColor = 'var(--red)';
        solInput.focus();
        return;
      }
      close({ amountSol, manualNote: noteInput.value });
    }

    cancelBtn.addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', confirm);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') confirm();
    });

    document.body.appendChild(overlay);
    solInput.select();
  });
}
