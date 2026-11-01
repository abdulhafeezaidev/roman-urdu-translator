/**
 * Roman Urdu Translator — Popup Controller (Phase 3)
 *
 * Communicates with the background service worker to:
 * - Query current webpage status (GET_STATUS)
 * - Trigger the translation pipeline via backend proxy (TRANSLATE_PAGE)
 * - Request original English restoration (RESTORE_ORIGINAL)
 * - Display operation statistics, backend connection status, and progress
 */

document.addEventListener('DOMContentLoaded', () => {
  const btnTranslate = document.getElementById('btn-translate');
  const btnCancel = document.getElementById('btn-cancel');
  const btnRestore = document.getElementById('btn-restore');
  const statusDot = document.getElementById('status-dot');
  const statusLabel = document.getElementById('status-label');
  const statusDetails = document.getElementById('status-details');
  const toggleAutoTranslate = document.getElementById('toggle-auto-translate');
  const autoTranslateDesc = document.getElementById('auto-translate-desc');

  let progressPollInterval = null;

  /**
   * Updates the popup status indicator and details.
   *
   * @param {string} type - 'ready' | 'busy' | 'info' | 'error'
   * @param {string} label - Short title
   * @param {string} details - HTML or text description
   */
  function updateStatus(type, label, details) {
    statusDot.className = 'status-dot';
    if (type !== 'ready') {
      statusDot.classList.add(type);
    }
    statusLabel.textContent = label;
    statusDetails.innerHTML = details;
  }

  /**
   * Sends a message to the background service worker.
   *
   * @param {Object} message
   * @returns {Promise<Object>}
   */
  function sendMessageToServiceWorker(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: 'RUNTIME_ERROR',
            message: chrome.runtime.lastError.message || 'Failed to communicate with service worker.'
          });
          return;
        }

        if (!response) {
          resolve({
            success: false,
            error: 'EMPTY_RESPONSE',
            message: 'No response received from extension background.'
          });
          return;
        }

        resolve(response);
      });
    });
  }

  /**
   * Disables or enables user action buttons.
   *
   * @param {boolean} disabled
   */
  function setButtonsDisabled(disabled) {
    btnTranslate.disabled = disabled;
    btnRestore.disabled = disabled;
  }

  /**
   * Starts periodic polling for translation progress.
   */
  function startProgressPolling() {
    stopProgressPolling();
    progressPollInterval = setInterval(async () => {
      const res = await sendMessageToServiceWorker({ type: 'GET_STATUS' });
      if (res && res.progress && res.state === 'translating') {
        const p = res.progress;
        if (p.visibleComplete && p.visibleBatches > 0 && p.currentBatch < p.totalBatches) {
          updateStatus(
            'busy',
            'Visible Done - Background...',
            `<p>Visible content translated! Completing background batch <strong>${p.currentBatch}</strong> of <strong>${p.totalBatches}</strong> (${p.appliedUnits} / ${p.totalUnits} sections)...</p>`
          );
        } else {
          updateStatus(
            'busy',
            'Translating...',
            `<p>Translating batch <strong>${p.currentBatch}</strong> of <strong>${p.totalBatches}</strong> (${p.appliedUnits} / ${p.totalUnits} sections)...</p>`
          );
        }
      }
    }, 600);
  }

  /**
   * Stops periodic polling.
   */
  function stopProgressPolling() {
    if (progressPollInterval) {
      clearInterval(progressPollInterval);
      progressPollInterval = null;
    }
  }

  /**
   * Initializes status on popup opening.
   */
  async function initStatus() {
    // Proactively ensure local backend is running in background via Native Messaging
    sendMessageToServiceWorker({ type: 'CHECK_BACKEND' }).catch(() => {});

    // Fetch Auto-Translate settings
    try {
      const settingsRes = await sendMessageToServiceWorker({ type: 'GET_SETTINGS' });
      if (settingsRes && settingsRes.success && settingsRes.settings) {
        const isAuto = Boolean(settingsRes.settings.autoTranslate);
        if (toggleAutoTranslate) {
          toggleAutoTranslate.checked = isAuto;
        }
        if (autoTranslateDesc) {
          autoTranslateDesc.textContent = isAuto ? 'Auto-translate is ON' : 'Translate pages automatically';
        }
      }
    } catch (e) {}

    const response = await sendMessageToServiceWorker({ type: 'GET_STATUS' });

    if (!response.success) {
      if (response.error === 'RESTRICTED_PAGE') {
        updateStatus(
          'error',
          'Restricted Page',
          response.message || 'Cannot run on Chrome system or Web Store pages.'
        );
        btnTranslate.disabled = true;
        btnRestore.disabled = true;
        return;
      }

      if (response.error === 'CONTENT_SCRIPT_UNAVAILABLE') {
        updateStatus(
          'info',
          'Ready',
          'Page is ready. Click "Translate Page" to begin.'
        );
        return;
      }

      updateStatus(
        'error',
        'Notice',
        response.message || 'Unable to connect to active tab.'
      );
      return;
    }

    if (response.modifiedNodes && response.modifiedNodes > 0) {
      updateStatus(
        'info',
        'Translated State',
        `<p><strong>${response.modifiedNodes}</strong> text nodes currently translated.</p>` +
        `<p class="text-subtext">Click "Restore Original" to revert to original English.</p>`
      );
    } else if (response.lastStats) {
      const stats = response.lastStats;
      if (stats.cancelled) {
        updateStatus(
          'info',
          'Translation Cancelled',
          `<p>Cancelled after <strong>${stats.appliedUnits}</strong> text nodes.</p>` +
          `<p class="text-subtext">Click "Restore Original" to revert to original English.</p>`
        );
      } else {
        updateStatus(
          'info',
          'Translation Complete',
          `<p>Applied to <strong>${stats.appliedUnits}</strong> nodes across <strong>${stats.totalBatches}</strong> batches.</p>` +
          `<p class="text-subtext">Page translated in-place into Roman Urdu.</p>`
        );
      }
    } else {
      updateStatus('ready', 'Ready', 'Extension is ready. Local backend starts automatically on translation.');
    }
  }

  // Handle Auto-Translate Toggle Change
  if (toggleAutoTranslate) {
    toggleAutoTranslate.addEventListener('change', async () => {
      const isAuto = toggleAutoTranslate.checked;
      if (autoTranslateDesc) {
        autoTranslateDesc.textContent = isAuto ? 'Auto-translate is ON' : 'Translate pages automatically';
      }
      await sendMessageToServiceWorker({
        type: 'UPDATE_SETTINGS',
        settings: { autoTranslate: isAuto }
      });
    });
  }

  // Handle Translate Page
  btnTranslate.addEventListener('click', async () => {
    setButtonsDisabled(true);
    btnCancel.style.display = 'block';
    btnCancel.disabled = false;
    updateStatus('busy', 'Connecting...', 'Starting translator backend and preparing batches...');

    // Automatically close popup after brief delay so user sees in-page floating progress circle
    setTimeout(() => {
      window.close();
    }, 350);

    startProgressPolling();

    try {
      const response = await sendMessageToServiceWorker({ type: 'TRANSLATE_PAGE' });
      stopProgressPolling();

      if (response.alreadyTranslated) {
        updateStatus(
          'info',
          'Already Translated',
          `<p>All eligible text nodes on this page are already translated.</p>` +
          `<p class="text-subtext">Click "Restore Original" if you wish to revert to English.</p>`
        );
        return;
      }

      if (response.cancelled) {
        updateStatus(
          'info',
          'Translation Cancelled',
          `<p>Translation stopped by user. <strong>${response.appliedUnits || 0}</strong> nodes translated.</p>` +
          `<p class="text-subtext">Original text is safe. Click "Restore Original" to revert.</p>`
        );
        return;
      }

      if (!response.success && !response.partial) {
        const errStr = (response.message || response.error || '').toString();
        if (response.error === 'BACKEND_OFFLINE' || errStr.includes('BACKEND_OFFLINE') || errStr.includes('Cannot connect to translation backend proxy')) {
          updateStatus(
            'error',
            'Backend Offline',
            `<p>${response.message || 'Translator backend proxy is not reachable.'}</p>` +
            `<p class="text-subtext">Tip: Run <code>scripts/setup-native-host.bat</code> once to enable automatic startup.</p>`
          );
        } else if (response.error === 'RATE_LIMITED' || errStr.includes('RATE_LIMITED') || errStr.toLowerCase().includes('rate limit')) {
          updateStatus(
            'error',
            'Rate Limit Reached',
            `<p>${response.message || 'Gemini API free-tier quota (20 requests/min) temporarily reached. Please wait a moment and try again.'}</p>`
          );
        } else {
          updateStatus(
            'error',
            'Translation Error',
            `<p>${response.message || response.error || 'Failed to complete translation pipeline.'}</p>`
          );
        }
        return;
      }

      const applied = response.appliedUnits || 0;
      const batches = response.totalBatches || 0;
      const chars = response.characters || 0;

      if (response.partial) {
        updateStatus(
          'info',
          'Partially Translated',
          `<p>Applied <strong>${applied}</strong> text nodes. <strong>${response.failedBatchesCount}</strong> batch(es) encountered an error.</p>` +
          `<p class="text-subtext">Original text is fully safe. Click "Restore Original" anytime.</p>`
        );
      } else {
        updateStatus(
          'info',
          'Translation Complete',
          `<p>Translated <strong>${applied}</strong> text nodes across <strong>${batches}</strong> batches (${chars.toLocaleString()} chars).</p>` +
          `<p class="text-subtext">Existing webpage text replaced in-place with Roman Urdu.</p>`
        );
      }
    } catch (err) {
      stopProgressPolling();
      updateStatus('error', 'Unexpected Error', err.message || 'An unexpected error occurred.');
    } finally {
      stopProgressPolling();
      btnCancel.style.display = 'none';
      setButtonsDisabled(false);
    }
  });

  // Handle Cancel Translation
  btnCancel.addEventListener('click', async () => {
    btnCancel.disabled = true;
    updateStatus('busy', 'Cancelling...', 'Halting translation pipeline and settling DOM...');
    await sendMessageToServiceWorker({ type: 'CANCEL_TRANSLATION' });
  });

  // Handle Restore Original
  btnRestore.addEventListener('click', async () => {
    setButtonsDisabled(true);
    updateStatus('busy', 'Restoring...', 'Reverting modified text nodes to original English...');

    try {
      const response = await sendMessageToServiceWorker({ type: 'RESTORE_ORIGINAL' });

      if (!response.success) {
        updateStatus(
          'error',
          'Restore Error',
          response.message || response.error || 'Failed to restore original text.'
        );
        return;
      }

      const count = response.restoredCount !== undefined ? response.restoredCount : 0;
      updateStatus(
        'ready',
        'Restored',
        `<p>Restored <strong>${count}</strong> text nodes to exact original English.</p>`
      );
    } catch (err) {
      updateStatus('error', 'Unexpected Error', err.message || 'An unexpected error occurred.');
    } finally {
      setButtonsDisabled(false);
    }
  });

  initStatus();
});
