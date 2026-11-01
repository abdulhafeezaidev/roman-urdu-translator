/**
 * Roman Urdu Translator — Background Service Worker (Phase 3)
 *
 * Manifest V3 Service Worker.
 * - Routes user actions from Popup to Content Script
 * - Routes translation batch requests from Content Script to Backend proxy
 * - Ensures no Gemini credentials exist in client-side code
 * - Validates tab security restrictions (chrome://, Web Store, etc.)
 */

'use strict';

/**
 * Default backend proxy URL for development.
 * Configurable without exposing any credentials.
 */
const DEFAULT_BACKEND_URL = 'http://localhost:3000/api/translate';

/**
 * Checks if a given URL is restricted by Chrome extension security policies.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isRestrictedUrl(url) {
  if (!url) return true;

  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'view-source:',
    'devtools://'
  ];

  for (const prefix of restrictedPrefixes) {
    if (url.startsWith(prefix)) {
      return true;
    }
  }

  // Chrome Web Store pages
  if (
    url.startsWith('https://chromewebstore.google.com') ||
    url.startsWith('https://chrome.google.com/webstore')
  ) {
    return true;
  }

  return false;
}

/**
 * Gets the current active tab in the current window.
 *
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return (tabs && tabs.length > 0) ? tabs[0] : null;
  } catch (err) {
    console.error('[Roman Urdu Translator SW] Error querying active tab:', err);
    return null;
  }
}

/**
 * Forwards a message from the popup to the active tab's content script.
 *
 * @param {Object} message - The message payload
 * @returns {Promise<Object>} Response from the content script or error descriptor
 */
async function forwardToContentScript(message) {
  const activeTab = await getActiveTab();

  if (!activeTab || !activeTab.id) {
    return {
      success: false,
      error: 'NO_ACTIVE_TAB',
      message: 'No active webpage tab found.'
    };
  }

  if (isRestrictedUrl(activeTab.url)) {
    return {
      success: false,
      error: 'RESTRICTED_PAGE',
      message: 'Roman Urdu Translator cannot run on Chrome internal or Web Store pages.'
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, message);
    if (!response) {
      return {
        success: false,
        error: 'EMPTY_RESPONSE',
        message: 'No response received from the webpage content script.'
      };
    }
    return response;
  } catch (err) {
    console.warn('[Roman Urdu Translator SW] Error communicating with content script:', err);
    return {
      success: false,
      error: 'CONTENT_SCRIPT_UNAVAILABLE',
      message: 'Cannot communicate with this page. Please refresh the page and try again.'
    };
  }
}

const NATIVE_HOST_NAME = 'com.roman_urdu_translator.host';
const HEALTH_URL = 'http://127.0.0.1:3000/health';

/**
 * Probes the backend /health endpoint.
 *
 * @param {string} [healthUrl]
 * @returns {Promise<{ alive: boolean, data?: Object }>}
 */
async function checkBackendHealth(healthUrl = HEALTH_URL) {
  try {
    const res = await fetch(healthUrl, { method: 'GET', signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { alive: true, data };
    }
    return { alive: false };
  } catch (err) {
    return { alive: false };
  }
}

/**
 * Ensures backend server is running.
 * If not reachable, uses Chrome Native Messaging to auto-start the local background process.
 *
 * @returns {Promise<{ success: boolean, status: string, message?: string }>}
 */
async function ensureBackendRunning() {
  const initial = await checkBackendHealth();
  if (initial.alive) {
    return { success: true, status: 'already_running', data: initial.data };
  }

  // Attempt to start via Native Messaging Host
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendNativeMessage) {
    try {
      const nativeResult = await new Promise((resolve, reject) => {
        chrome.runtime.sendNativeMessage(
          NATIVE_HOST_NAME,
          { command: 'ensure_server' },
          (response) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            resolve(response);
          }
        );
      });

      if (nativeResult && nativeResult.success) {
        // Poll /health for up to 4 seconds
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 300));
          const check = await checkBackendHealth();
          if (check.alive) {
            return { success: true, status: 'started', data: check.data };
          }
        }
      }
    } catch (err) {
      console.warn('[Roman Urdu Translator SW] Native messaging host not available:', err.message);
    }
  }

  // Re-check one last time in case user started manually
  const finalCheck = await checkBackendHealth();
  if (finalCheck.alive) {
    return { success: true, status: 'ready', data: finalCheck.data };
  }

  return {
    success: false,
    error: 'BACKEND_OFFLINE',
    message: 'Translator backend is not running. Run setup-native-host.bat (one-time setup) or start: node backend/server.js'
  };
}

/**
 * Sends a translation batch to the secure backend proxy server.
 * Handles timeouts, network errors, and returns clean structured responses.
 * Automatically wakes the backend if offline.
 *
 * @param {Object} batch - Validated translation batch
 * @param {string} [backendUrl] - Optional custom backend URL
 * @returns {Promise<Object>}
 */
async function sendBatchToBackend(batch, backendUrl = DEFAULT_BACKEND_URL) {
  // 1. Ensure backend is running before attempting request
  const backendState = await ensureBackendRunning();
  if (!backendState.success) {
    return {
      success: false,
      error: backendState.error || 'BACKEND_UNAVAILABLE',
      message: backendState.message || 'Cannot connect to translation backend proxy.'
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(batch),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        status: response.status,
        error: (errData.error && errData.error.code) || 'BACKEND_HTTP_ERROR',
        message: (errData.error && errData.error.message) || `Backend responded with HTTP status ${response.status}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      ...data
    };
  } catch (err) {
    clearTimeout(timeoutId);

    const isTimeout = err.name === 'AbortError';
    return {
      success: false,
      error: isTimeout ? 'BACKEND_TIMEOUT' : 'BACKEND_UNAVAILABLE',
      message: isTimeout
        ? 'Backend translation request timed out.'
        : 'Cannot connect to translation backend proxy (http://localhost:3000).'
    };
  }
}

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Case A: Message from content script requesting backend proxy translation
  if (sender.tab && request && request.type === 'TRANSLATE_BATCH_VIA_BACKEND') {
    sendBatchToBackend(request.batch, request.backendUrl)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({
        success: false,
        error: 'SW_BACKEND_ERROR',
        message: err.message || 'Error proxying batch to backend.'
      }));
    return true; // Keep message port open for async response
  }

  // Case B: Direct backend status check from popup
  if (!sender.tab && request && request.type === 'CHECK_BACKEND') {
    ensureBackendRunning()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Case C: Settings query and update (accessible by both popup and content scripts)
  if (request && request.type === 'GET_SETTINGS') {
    fetch('http://127.0.0.1:3000/api/settings')
      .then((res) => res.json())
      .then((data) => sendResponse(data))
      .catch(() => sendResponse({ success: true, settings: { autoTranslate: false } }));
    return true;
  }

  if (request && request.type === 'UPDATE_SETTINGS') {
    fetch('http://127.0.0.1:3000/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.settings || {})
    })
      .then((res) => res.json())
      .then((data) => sendResponse(data))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Case D: Message from popup directed to content script
  if (!sender.tab) {
    const validTypes = ['TRANSLATE_PAGE', 'RESTORE_ORIGINAL', 'GET_STATUS', 'CANCEL_TRANSLATION'];
    if (!request || !validTypes.includes(request.type)) {
      sendResponse({
        success: false,
        error: 'INVALID_MESSAGE_TYPE',
        message: `Unknown or unsupported message type: ${request ? request.type : 'none'}`
      });
      return false;
    }

    forwardToContentScript(request)
      .then((response) => sendResponse(response))
      .catch((err) => sendResponse({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred in the service worker.'
      }));
    return true;
  }

  return false;
});

// Extension install / update lifecycle
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[Roman Urdu Translator SW] Extension installed/updated (Phase 3 Backend Proxy ready). Reason: ${details.reason}`);
});
