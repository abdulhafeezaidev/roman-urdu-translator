/**
 * Roman Urdu Translator — Content Script (Phase 3 Verified)
 *
 * Implements the translation pipeline connected to the Secure Backend Proxy:
 * - Extraction of eligible text nodes into structured TranslationUnits
 * - Deterministic batching of translation units
 * - Batch translation via Secure Backend Proxy
 * - Explicit error propagation (NEVER silently substitutes fake translations on failure)
 * - Safe DOM application with node existence, connectivity, and integrity checks
 * - Safe restoration of original English text without page reloads
 * - Operation ID gating to prevent race conditions and stale async overwrites
 */

(function () {
  'use strict';

  if (window.__romanUrduTranslatorLoaded) {
    return;
  }
  window.__romanUrduTranslatorLoaded = true;

  const TextUtils = window.TextUtils;
  if (!TextUtils) {
    console.error('[Roman Urdu Translator] TextUtils not found in content script context.');
    return;
  }

  const { PIPELINE_STATES, OriginalTextStore } = TextUtils;

  // Active persistent store of original text nodes
  const originalStore = new OriginalTextStore();

  // Internal state model
  let currentState = PIPELINE_STATES.IDLE;
  let currentOperationId = null;
  let activeNodeMap = new Map();
  let lastOperationStats = null;

  // Phase 5: Dynamic Content & MutationObserver controls
  let mutationObserver = null;
  let isApplyingTranslations = false;
  let mutationDebounceTimer = null;
  const MUTATION_DEBOUNCE_MS = 300;
  let pendingMutatedRoots = new Set();
  let lastUrl = typeof window !== 'undefined' ? window.location.href : '';

  // Phase 6: Cancellation & Progress
  let isCancelled = false;
  let currentProgress = null;

  /**
   * Generates a unique operation ID.
   *
   * @returns {string}
   */
  function generateOperationId() {
    return `op-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Phase 10 In-Page Floating Circular Progress Widget
   * Isolated within a Shadow DOM so host page CSS cannot interfere.
   * Displays circular progress, live ETA, and automatically fades away when finished.
   */
  const FloatingProgressWidget = (function () {
    let hostEl = null;
    let shadowRoot = null;
    let containerEl = null;
    let circleProgressEl = null;
    let textCenterEl = null;
    let textEtaEl = null;
    let textStatusEl = null;
    let fadeTimeout = null;

    const CIRCUMFERENCE = 106.8; // 2 * PI * 17

    function ensureMounted() {
      if (hostEl && hostEl.isConnected) return;
      if (typeof document === 'undefined' || !document.body) return;

      hostEl = document.createElement('div');
      hostEl.id = '__rut_widget_host';
      hostEl.style.cssText = 'all: initial !important; position: fixed !important; bottom: 24px !important; right: 24px !important; z-index: 2147483647 !important; pointer-events: auto !important;';

      shadowRoot = hostEl.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = `
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .rut-widget {
          display: flex;
          align-items: center;
          background: rgba(15, 23, 42, 0.90);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 9999px;
          padding: 6px 14px 6px 6px;
          gap: 10px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(16, 185, 129, 0.25);
          color: #f8fafc;
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          opacity: 0;
          transform: translateY(16px) scale(0.92);
          user-select: none;
        }
        .rut-widget.visible {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .rut-widget.completed {
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 20px rgba(16, 185, 129, 0.4);
          border-color: rgba(16, 185, 129, 0.4);
        }
        .rut-ring-box {
          position: relative;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .rut-ring-svg {
          transform: rotate(-90deg);
          width: 44px;
          height: 44px;
        }
        .rut-ring-bg {
          stroke: rgba(255, 255, 255, 0.12);
        }
        .rut-ring-val {
          stroke: #10b981;
          stroke-dasharray: 106.8;
          stroke-dashoffset: 106.8;
          transition: stroke-dashoffset 0.35s ease, stroke 0.3s ease;
        }
        .rut-center-text {
          position: absolute;
          font-size: 11px;
          font-weight: 700;
          color: #ecfdf5;
          letter-spacing: -0.2px;
        }
        .rut-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 140px;
        }
        .rut-title {
          font-size: 12px;
          font-weight: 600;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .rut-eta {
          font-size: 11px;
          color: #94a3b8;
        }
        .rut-btn-cancel {
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 13px;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 4px;
          margin-left: auto;
          transition: color 0.15s ease;
        }
        .rut-btn-cancel:hover {
          color: #ef4444;
        }
      `;

      containerEl = document.createElement('div');
      containerEl.className = 'rut-widget';
      containerEl.innerHTML = `
        <div class="rut-ring-box">
          <svg class="rut-ring-svg" viewBox="0 0 44 44">
            <circle class="rut-ring-bg" stroke-width="3.5" fill="none" r="17" cx="22" cy="22"/>
            <circle class="rut-ring-val" stroke-width="3.5" stroke-linecap="round" fill="none" r="17" cx="22" cy="22"/>
          </svg>
          <span class="rut-center-text">0%</span>
        </div>
        <div class="rut-content">
          <div class="rut-title">
            <span>Roman Urdu</span>
          </div>
          <div class="rut-eta">Starting translation...</div>
        </div>
        <button class="rut-btn-cancel" title="Cancel translation">✕</button>
      `;

      shadowRoot.appendChild(style);
      shadowRoot.appendChild(containerEl);

      circleProgressEl = containerEl.querySelector('.rut-ring-val');
      textCenterEl = containerEl.querySelector('.rut-center-text');
      textStatusEl = containerEl.querySelector('.rut-title span');
      textEtaEl = containerEl.querySelector('.rut-eta');

      const btnCancel = containerEl.querySelector('.rut-btn-cancel');
      btnCancel.addEventListener('click', (e) => {
        e.stopPropagation();
        handleCancelTranslation();
        hide();
      });

      document.body.appendChild(hostEl);
    }

    function show() {
      ensureMounted();
      if (fadeTimeout) {
        clearTimeout(fadeTimeout);
        fadeTimeout = null;
      }
      if (containerEl) {
        containerEl.classList.remove('completed');
        containerEl.classList.add('visible');
        if (circleProgressEl) {
          circleProgressEl.style.stroke = '#10b981';
          circleProgressEl.style.strokeDashoffset = '106.8';
        }
        if (textCenterEl) {
          textCenterEl.textContent = '0%';
          textCenterEl.style.color = '#ecfdf5';
          textCenterEl.style.fontSize = '11px';
        }
        if (textStatusEl) textStatusEl.textContent = 'Roman Urdu';
        if (textEtaEl) textEtaEl.textContent = 'Starting translation...';
      }
    }

    function update(progress) {
      ensureMounted();
      if (!containerEl || !containerEl.classList.contains('visible')) {
        show();
      }

      const percent = Math.min(99, Math.max(0, progress.percent || 0));
      const offset = CIRCUMFERENCE * (1 - (percent / 100));

      if (circleProgressEl) {
        circleProgressEl.style.strokeDashoffset = offset.toFixed(1);
      }

      const eta = progress.etaSeconds || 1;
      if (textCenterEl) {
        textCenterEl.textContent = `${percent}%`;
      }

      if (textEtaEl) {
        const passText = progress.passNumber && progress.passNumber > 1 ? ` (Pass ${progress.passNumber})` : '';
        textEtaEl.textContent = `Batch ${progress.currentBatch}/${progress.totalBatches}${passText} • Est. ~${eta}s`;
      }
    }

    function complete(stats) {
      if (!containerEl) return;
      containerEl.classList.add('completed');
      if (circleProgressEl) {
        circleProgressEl.style.strokeDashoffset = '0';
        circleProgressEl.style.stroke = '#10b981';
      }
      if (textCenterEl) {
        textCenterEl.textContent = '✓';
        textCenterEl.style.color = '#10b981';
        textCenterEl.style.fontSize = '16px';
      }
      if (textStatusEl) {
        textStatusEl.textContent = 'Page Translated';
      }
      if (textEtaEl) {
        textEtaEl.textContent = `${stats.appliedUnits || 0} sections translated`;
      }

      // Automatically fade out and disappear after 2.5 seconds
      fadeTimeout = setTimeout(() => {
        hide();
      }, 2500);
    }

    function hide() {
      if (containerEl) {
        containerEl.classList.remove('visible');
        setTimeout(() => {
          if (hostEl && hostEl.isConnected && !containerEl.classList.contains('visible')) {
            hostEl.remove();
            hostEl = null;
          }
        }, 400);
      }
    }

    return {
      show,
      update,
      complete,
      hide
    };
  })();

  /**
   * Translates a single batch by routing through the background service worker
   * to the backend proxy (POST /api/translate) with automatic retry.
   *
   * @param {Object} batch
   * @param {number} [retries=2]
   * @returns {Promise<Object>}
   */
  async function translateBatchViaBackend(batch, retries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (isCancelled) {
        throw new Error('Translation cancelled by user.');
      }
      try {
        const response = await new Promise((resolve, reject) => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage(
              { type: 'TRANSLATE_BATCH_VIA_BACKEND', batch },
              (res) => {
                if (chrome.runtime.lastError) {
                  return reject(new Error(chrome.runtime.lastError.message || 'Failed to communicate with service worker.'));
                }

                if (!res || !res.success) {
                  const errCode = (res && res.error) || 'BACKEND_ERROR';
                  const errMsg = (res && res.message) || 'Translation request failed on backend proxy.';
                  return reject(new Error(`[${errCode}] ${errMsg}`));
                }

                resolve(res);
              }
            );
          } else {
            reject(new Error('Chrome extension runtime messaging is not available in this context.'));
          }
        });
        return response;
      } catch (err) {
        lastError = err;
        if (attempt < retries && !isCancelled) {
          console.warn(`[Roman Urdu Translator] Batch ${batch.batchId} retry ${attempt + 1}/${retries}... (${err.message})`);
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw lastError || new Error('Batch translation failed after retries.');
  }

  /**
   * Disconnects the dynamic content MutationObserver if active.
   */
  function stopMutationObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (mutationDebounceTimer) {
      clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = null;
    }
    pendingMutatedRoots.clear();
  }

  /**
   * Initializes or resumes the controlled MutationObserver for dynamically added content.
   * Guarded to prevent recursive translation loops:
   * - Ignores mutations triggered while isApplyingTranslations is true
   * - Only processes newly added elements/nodes that are not already modified
   * - Coalesces mutation bursts with a 300ms debounce
   */
  function startControlledMutationObserver() {
    if (mutationObserver || typeof MutationObserver === 'undefined') {
      return;
    }

    mutationObserver = new MutationObserver((mutations) => {
      if (isApplyingTranslations) {
        return; // Safeguard: Ignore mutations generated by our own text translation
      }

      // Only observe if currently in a translated state
      if (currentState !== PIPELINE_STATES.COMPLETED && currentState !== PIPELINE_STATES.PARTIAL_SUCCESS) {
        return;
      }

      let hasNewCandidates = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (let i = 0; i < mutation.addedNodes.length; i++) {
            const added = mutation.addedNodes[i];
            if (added.nodeType === 1 || added.nodeType === 3) {
              pendingMutatedRoots.add(added);
              hasNewCandidates = true;
            }
          }
        }
      }

      if (hasNewCandidates) {
        if (mutationDebounceTimer) {
          clearTimeout(mutationDebounceTimer);
        }
        mutationDebounceTimer = setTimeout(processPendingMutations, MUTATION_DEBOUNCE_MS);
      }
    });

    const target = document.body || document.documentElement;
    if (target) {
      mutationObserver.observe(target, {
        childList: true,
        subtree: true
      });
    }
  }

  /**
   * Processes batched dynamic content mutations after settling debounce.
   */
  async function processPendingMutations() {
    mutationDebounceTimer = null;
    if (pendingMutatedRoots.size === 0 || isApplyingTranslations) {
      return;
    }

    const roots = Array.from(pendingMutatedRoots);
    pendingMutatedRoots.clear();

    const dynamicUnits = [];
    const dynamicNodeMap = new Map();
    const dynamicOpId = `dyn-${Date.now()}`;
    let unitIndex = 0;

    for (const root of roots) {
      if (!root.isConnected) continue;
      const extraction = TextUtils.extractTranslationUnits(
        root.nodeType === 1 ? root : root.parentElement,
        dynamicOpId,
        { store: originalStore }
      );

      for (const unit of extraction.units) {
        if (!activeNodeMap.has(unit.id)) {
          dynamicUnits.push(unit);
          dynamicNodeMap.set(unit.id, unit);
          activeNodeMap.set(unit.id, unit);
        }
      }
    }

    if (dynamicUnits.length === 0) {
      return;
    }

    console.log(`[Roman Urdu Translator] Detected ${dynamicUnits.length} dynamic text units. Translating...`);

    const batches = TextUtils.createBatches(dynamicUnits, { operationId: dynamicOpId });
    for (const batch of batches) {
      try {
        const res = await translateBatchViaBackend(batch);
        if (res && Array.isArray(res.results)) {
          isApplyingTranslations = true;
          try {
            for (const item of res.results) {
              TextUtils.applyTranslationResult(item, dynamicNodeMap, originalStore);
            }
          } finally {
            isApplyingTranslations = false;
          }
        }
      } catch (err) {
        console.warn('[Roman Urdu Translator] Dynamic content batch translation failed:', err.message);
      }
    }
  }

  /**
   * Handles SPA client-side route navigation.
   */
  function handleRouteChanged() {
    console.log(`[Roman Urdu Translator] Route changed to ${window.location.href}. Resetting active operation.`);
    stopMutationObserver();
    currentOperationId = null;
    activeNodeMap.clear();
    currentState = PIPELINE_STATES.IDLE;
  }

  // Setup SPA navigation listeners
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        handleRouteChanged();
      }
    });

    if (typeof history !== 'undefined') {
      const origPush = history.pushState;
      if (typeof origPush === 'function') {
        history.pushState = function () {
          const ret = origPush.apply(this, arguments);
          if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            handleRouteChanged();
          }
          return ret;
        };
      }

      const origReplace = history.replaceState;
      if (typeof origReplace === 'function') {
        history.replaceState = function () {
          const ret = origReplace.apply(this, arguments);
          if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            handleRouteChanged();
          }
          return ret;
        };
      }
    }
  }

  /**
   * Executes the Phase 5 Translation Pipeline with partial failure resilience
   * and duplicate translation prevention.
   *
   * @returns {Promise<Object>} Operation report
   */
  async function runTranslationPipeline() {
    stopMutationObserver();
    const operationId = generateOperationId();
    currentOperationId = operationId;

    try {
      currentState = PIPELINE_STATES.TRANSLATING;
      isCancelled = false;
      const root = document.body || document.documentElement;

      let appliedCount = 0;
      let failedOrSkippedCount = 0;
      const failedBatches = [];
      const batchTimingStats = [];
      const pipelineStartTime = performance.now();
      const CONCURRENCY_LIMIT = 2;

      let pass = 1;
      const MAX_PASSES = 4;
      let totalBatchesAcrossPasses = 0;
      let completedBatchesAcrossPasses = 0;
      let totalUnitsExtracted = 0;
      let totalCharactersExtracted = 0;

      FloatingProgressWidget.show();

      while (pass <= MAX_PASSES) {
        if (isCancelled || currentOperationId !== operationId) {
          break;
        }

        currentState = PIPELINE_STATES.EXTRACTING;
        const processedNodes = new WeakSet();
        const extraction = TextUtils.extractTranslationUnits(root, `${operationId}-p${pass}`, {
          store: originalStore,
          processedSet: processedNodes
        }, window);

        const units = extraction.units;
        if (units.length === 0) {
          // No more untranslated eligible text nodes found on document
          break;
        }

        totalUnitsExtracted += units.length;
        totalCharactersExtracted += extraction.characters;

        // Register new units in activeNodeMap
        for (const [key, val] of extraction.nodeMap.entries()) {
          activeNodeMap.set(key, val);
        }

        currentState = PIPELINE_STATES.BATCHING;
        let batches;
        let visibleBatchesCount = 0;

        if (pass === 1) {
          // Prioritize top visible elements on initial pass
          const { visibleUnits, backgroundUnits } = (typeof TextUtils.partitionUnitsByVisibility === 'function')
            ? TextUtils.partitionUnitsByVisibility(units, activeNodeMap, window)
            : { visibleUnits: units, backgroundUnits: [] };

          const visibleBatches = visibleUnits.length > 0
            ? TextUtils.createBatches(visibleUnits, { operationId: `${operationId}-v` })
            : [];
          const backgroundBatches = backgroundUnits.length > 0
            ? TextUtils.createBatches(backgroundUnits, { operationId: `${operationId}-bg` })
            : [];

          if (visibleBatches.length === 0 && backgroundBatches.length === 0) {
            batches = TextUtils.createBatches(units, { operationId });
            visibleBatchesCount = batches.length;
          } else if (visibleBatches.length === 0) {
            batches = backgroundBatches;
          } else {
            batches = [...visibleBatches, ...backgroundBatches];
            visibleBatchesCount = visibleBatches.length;
          }
        } else {
          batches = TextUtils.createBatches(units, { operationId: `${operationId}-p${pass}` });
        }

        totalBatchesAcrossPasses += batches.length;
        console.log(
          `[Roman Urdu Translator] Pass ${pass}: Found ${units.length} units across ${batches.length} batches.`
        );

        currentState = PIPELINE_STATES.TRANSLATING;
        let nextBatchIndex = 0;

        async function translationWorker(workerId) {
          while (nextBatchIndex < batches.length) {
            if (isCancelled || currentOperationId !== operationId) {
              break;
            }

            const batchIdx = nextBatchIndex++;
            const batch = batches[batchIdx];
            const batchStart = performance.now();

            let batchResponse;
            try {
              batchResponse = await translateBatchViaBackend(batch, 2);
            } catch (err) {
              failedBatches.push({
                batchId: batch.batchId,
                itemsCount: batch.items.length,
                error: err.message
              });
              failedOrSkippedCount += batch.items.length;
              completedBatchesAcrossPasses++;
              continue;
            }

            if (isCancelled || currentOperationId !== operationId) {
              break;
            }

            currentState = PIPELINE_STATES.APPLYING;
            if (batchResponse && Array.isArray(batchResponse.results)) {
              isApplyingTranslations = true;
              try {
                for (const result of batchResponse.results) {
                  const applyStatus = TextUtils.applyTranslationResult(result, activeNodeMap, originalStore);
                  if (applyStatus.success) {
                    appliedCount++;
                  } else {
                    failedOrSkippedCount++;
                  }
                }
              } finally {
                isApplyingTranslations = false;
              }
            }

            const batchDuration = performance.now() - batchStart;
            batchTimingStats.push({
              batchId: batch.batchId,
              items: batch.items.length,
              durationMs: Math.round(batchDuration)
            });

            completedBatchesAcrossPasses++;

            // Live progress and estimated time calculation
            const avgMs = batchTimingStats.reduce((a, b) => a + b.durationMs, 0) / Math.max(1, batchTimingStats.length);
            const remainingBatches = Math.max(0, totalBatchesAcrossPasses - completedBatchesAcrossPasses);
            const etaSeconds = Math.max(1, Math.ceil((remainingBatches / CONCURRENCY_LIMIT) * (avgMs / 1000)));
            const percent = Math.min(99, Math.round((completedBatchesAcrossPasses / Math.max(1, totalBatchesAcrossPasses)) * 100));

            currentProgress = {
              currentBatch: completedBatchesAcrossPasses,
              totalBatches: totalBatchesAcrossPasses,
              appliedUnits: appliedCount,
              totalUnits: totalUnitsExtracted,
              percent,
              etaSeconds,
              passNumber: pass,
              concurrency: CONCURRENCY_LIMIT
            };

            FloatingProgressWidget.update(currentProgress);
          }
        }

        const activeWorkerCount = Math.min(CONCURRENCY_LIMIT, batches.length);
        const workerPromises = [];
        for (let w = 0; w < activeWorkerCount; w++) {
          workerPromises.push(translationWorker(w));
        }
        await Promise.all(workerPromises);

        pass++;
      }

      const totalDurationMs = Math.round(performance.now() - pipelineStartTime);

      if (isCancelled) {
        FloatingProgressWidget.hide();
        if (appliedCount > 0) {
          currentState = PIPELINE_STATES.PARTIAL_SUCCESS;
          startControlledMutationObserver();
        } else {
          currentState = PIPELINE_STATES.IDLE;
        }

        lastOperationStats = {
          operationId,
          totalUnits: totalUnitsExtracted,
          totalBatches: totalBatchesAcrossPasses,
          appliedUnits: appliedCount,
          failedBatchesCount: failedBatches.length,
          skippedUnits: failedOrSkippedCount,
          characters: totalCharactersExtracted,
          backendConnected: true,
          translationImplemented: true,
          cancelled: true,
          partial: appliedCount > 0
        };

        return {
          success: appliedCount > 0,
          cancelled: true,
          ...lastOperationStats,
          message: `Translation cancelled. ${appliedCount} sections translated.`
        };
      }

      if (appliedCount === 0 && originalStore.modifiedCount() > 0) {
        FloatingProgressWidget.hide();
        currentState = PIPELINE_STATES.COMPLETED;
        return {
          success: true,
          operationId,
          totalUnits: 0,
          totalBatches: 0,
          appliedUnits: 0,
          alreadyTranslated: true,
          message: 'All eligible text nodes on this page are already translated.'
        };
      }

      if (appliedCount > 0) {
        currentState = PIPELINE_STATES.COMPLETED;
        FloatingProgressWidget.complete({ appliedUnits: appliedCount });
        startControlledMutationObserver();
      } else if (failedBatches.length > 0) {
        currentState = PIPELINE_STATES.FAILED;
        FloatingProgressWidget.hide();
      } else {
        currentState = PIPELINE_STATES.IDLE;
        FloatingProgressWidget.hide();
      }

      lastOperationStats = {
        operationId,
        totalUnits: totalUnitsExtracted,
        totalBatches: totalBatchesAcrossPasses,
        appliedUnits: appliedCount,
        failedBatchesCount: failedBatches.length,
        failedBatches,
        skippedUnits: failedOrSkippedCount,
        characters: totalCharactersExtracted,
        backendConnected: true,
        translationImplemented: true,
        partial: currentState === PIPELINE_STATES.PARTIAL_SUCCESS,
        totalDurationMs,
        concurrency: CONCURRENCY_LIMIT,
        batchTimings: batchTimingStats
      };

      console.log(
        `[Roman Urdu Translator] Full-page pipeline ended with state ${currentState}. ` +
        `Applied: ${appliedCount}, Total Batches: ${totalBatchesAcrossPasses}.`
      );

      return {
        success: appliedCount > 0,
        ...lastOperationStats
      };
    } catch (err) {
      currentState = PIPELINE_STATES.FAILED;
      FloatingProgressWidget.hide();
      console.error('[Roman Urdu Translator] Pipeline execution failed:', err);
      return {
        success: false,
        operationId,
        error: err.message || 'Pipeline execution failed'
      };
    }
  }

  /**
   * Restores all modified DOM text nodes back to original English.
   *
   * @returns {Object}
   */
  function handleRestoreOriginal() {
    stopMutationObserver();
    currentOperationId = null;
    currentState = PIPELINE_STATES.RESTORING;
    FloatingProgressWidget.hide();

    try {
      isApplyingTranslations = true;
      let restoredCount = 0;
      try {
        restoredCount = originalStore.restoreAll();
      } finally {
        isApplyingTranslations = false;
      }

      currentState = PIPELINE_STATES.IDLE;
      activeNodeMap.clear();

      console.log(`[Roman Urdu Translator] Restored ${restoredCount} text nodes to original English.`);

      return {
        success: true,
        restoredCount,
        message: 'Page restored to original English.'
      };
    } catch (err) {
      currentState = PIPELINE_STATES.FAILED;
      console.error('[Roman Urdu Translator] Error restoring original text:', err);
      return {
        success: false,
        error: err.message || 'Error restoring original text'
      };
    }
  }

  /**
   * Cancels active translation pipeline if running.
   *
   * @returns {Object}
   */
  function handleCancelTranslation() {
    isCancelled = true;
    FloatingProgressWidget.hide();
    console.log('[Roman Urdu Translator] Cancellation requested by user.');
    return {
      success: true,
      cancelled: true,
      message: 'Cancellation requested.'
    };
  }

  /**
   * Returns current content script status.
   *
   * @returns {Object}
   */
  function handleGetStatus() {
    return {
      success: true,
      state: currentState,
      operationId: currentOperationId,
      modifiedNodes: originalStore.modifiedCount(),
      trackedNodes: originalStore.size(),
      isObservingMutations: Boolean(mutationObserver),
      progress: currentProgress,
      isCancelled,
      lastStats: lastOperationStats
    };
  }

  // Central Chrome runtime message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.type) {
      return false;
    }

    switch (request.type) {
      case 'TRANSLATE_PAGE': {
        runTranslationPipeline()
          .then((response) => sendResponse(response))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }
      case 'RESTORE_ORIGINAL': {
        const result = handleRestoreOriginal();
        sendResponse(result);
        break;
      }
      case 'CANCEL_TRANSLATION': {
        const result = handleCancelTranslation();
        sendResponse(result);
        break;
      }
      case 'GET_STATUS': {
        const result = handleGetStatus();
        sendResponse(result);
        break;
      }
      default:
        sendResponse({ success: false, error: `Unknown message type: ${request.type}` });
        break;
    }

    return true;
  });

  // Zero-Click Auto-Translate Initialization (Phase 10)
  function checkAutoTranslate() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return;
      }
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success || !response.settings) {
          return;
        }
        if (response.settings.autoTranslate === true) {
          console.log('[Roman Urdu Translator] Auto-Translate enabled. Auto-initiating full-page translation...');
          setTimeout(() => {
            if (currentState === PIPELINE_STATES.IDLE && originalStore.modifiedCount() === 0) {
              runTranslationPipeline().catch(() => {});
            }
          }, 500);
        }
      });
    } catch (e) {}
  }

  if (typeof document !== 'undefined' && document.readyState !== 'loading') {
    checkAutoTranslate();
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', checkAutoTranslate);
  }

  console.log('[Roman Urdu Translator] Content script initialized (Phase 10 Continuous Auto-Translate active).');
})();
