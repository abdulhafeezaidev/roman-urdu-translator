/**
 * Roman Urdu Translator — Text & DOM Utilities (Phase 2)
 *
 * Provides reusable functions for:
 * - Centralized protected elements registry & ancestor checks
 * - Element visibility checks
 * - Text node eligibility evaluation
 * - Translation unit generation with unique IDs
 * - Deterministic batching with configurable item & character limits
 * - OriginalTextStore for tracking and reverting modified nodes
 * - Safe DOM application with node existence, connectivity, and text integrity validation
 * - Development-only MockTranslator adhering to the translation contract
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment (for automated testing)
    module.exports = factory();
  } else {
    // Browser / Content Script environment
    root.TextUtils = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * HTML tags that must never be processed or translated.
   * Centralized exclusion list as required by TECHNICAL_ARCHITECTURE.md
   */
  const PROTECTED_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'CODE',
    'PRE',
    'TEXTAREA',
    'INPUT',
    'SELECT',
    'OPTION',
    'SVG',
    'CANVAS',
    'VIDEO',
    'AUDIO',
    'IFRAME',
    'KBD',
    'SAMP',
    'VAR'
  ]);

  /**
   * Default batching configuration constants.
   * Configurable to adjust for future Gemini API token limits.
   */
  const BATCH_CONFIG = {
    DEFAULT_MAX_ITEMS: 50,
    DEFAULT_MAX_CHARACTERS: 6500
  };

  /**
   * Translation pipeline states.
   */
  const PIPELINE_STATES = {
    IDLE: 'IDLE',
    EXTRACTING: 'EXTRACTING',
    BATCHING: 'BATCHING',
    TRANSLATING: 'TRANSLATING',
    APPLYING: 'APPLYING',
    COMPLETED: 'COMPLETED',
    PARTIAL_SUCCESS: 'PARTIAL_SUCCESS',
    FAILED: 'FAILED',
    RESTORING: 'RESTORING'
  };

  /**
   * Checks if an element or any of its ancestors is protected.
   *
   * @param {Element|null} element - DOM element to check
   * @returns {boolean} True if element or an ancestor is protected
   */
  function isElementProtected(element) {
    let current = element;
    while (current && current.nodeType === 1) {
      const tagName = current.tagName.toUpperCase();
      if (PROTECTED_TAGS.has(tagName)) {
        return true;
      }

      // Check standard HTML translation exclusion attributes & classes
      if (current.getAttribute && (
        current.getAttribute('translate') === 'no' ||
        current.getAttribute('data-no-translate') !== null ||
        (current.classList && (
          current.classList.contains('notranslate') ||
          current.classList.contains('no-translate')
        ))
      )) {
        return true;
      }

      // Check for contentEditable blocks
      if (current.isContentEditable) {
        return true;
      }

      current = current.parentElement;
    }
    return false;
  }

  /**
   * Determines if a DOM element is visible to the user.
   *
   * @param {Element|null} element - DOM element to check
   * @param {Window} [win] - Optional window object
   * @returns {boolean} True if the element is visible
   */
  function isElementVisible(element, win) {
    if (!element || element.nodeType !== 1) {
      return false;
    }

    if (element.hasAttribute && element.hasAttribute('hidden')) {
      return false;
    }

    if (element.getAttribute && element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    const currentWindow = win || (typeof window !== 'undefined' ? window : null);
    if (currentWindow && typeof currentWindow.getComputedStyle === 'function') {
      let current = element;
      while (current && current.nodeType === 1) {
        const style = currentWindow.getComputedStyle(current);
        if (style) {
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
            return false;
          }
          if (parseFloat(style.opacity) === 0) {
            return false;
          }
        }
        current = current.parentElement;
      }
    }

    return true;
  }

  /**
   * Evaluates if a text node contains translatable text.
   *
   * @param {Node} node - Text node to evaluate
   * @param {Window} [win] - Optional window object
   * @returns {boolean}
   */
  function isEligibleTextNode(node, win) {
    if (!node || node.nodeType !== 3) { // 3 = Node.TEXT_NODE
      return false;
    }

    const rawText = node.nodeValue;
    if (!rawText) {
      return false;
    }

    const trimmed = rawText.trim();
    if (trimmed.length === 0) {
      return false;
    }

    // Ignore text composed purely of punctuation/symbols with no letters or digits
    if (!/[A-Za-z0-9]/.test(trimmed)) {
      return false;
    }

    const parent = node.parentElement;
    if (!parent) {
      return false;
    }

    if (isElementProtected(parent)) {
      return false;
    }

    if (!isElementVisible(parent, win)) {
      return false;
    }

    return true;
  }

  /**
   * Collapses multiple consecutive whitespace characters into a single space.
   *
   * @param {string} text
   * @returns {string}
   */
  function normalizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Creates a structured translation unit from a DOM text node.
   * DOM nodeReference remains strictly local to the content script.
   *
   * @param {Node} node - DOM text node
   * @param {number} index - Sequence index within current operation
   * @param {string} operationId - Unique identifier of current operation
   * @returns {Object} TranslationUnit
   */
  function createTranslationUnit(node, index, operationId) {
    const rawText = node.nodeValue || '';
    const norm = normalizeText(rawText);
    return {
      id: `${operationId}-unit-${index}`,
      text: rawText,
      normalizedText: norm,
      originalText: rawText,
      nodeReference: node,
      characterCount: norm.length
    };
  }

  /**
   * Deterministically groups translation units into batches respecting maximum
   * item count and maximum character limits.
   *
   * @param {Array<Object>} units - List of translation units
   * @param {Object} [options] - Configuration options
   * @param {number} [options.maxItems] - Maximum units per batch
   * @param {number} [options.maxCharacters] - Maximum total characters per batch
   * @param {string} [options.operationId] - Operation identifier
   * @returns {Array<Object>} List of batches
   */
  function createBatches(units, options = {}) {
    if (!Array.isArray(units) || units.length === 0) {
      return [];
    }

    const maxItems = options.maxItems || BATCH_CONFIG.DEFAULT_MAX_ITEMS;
    const maxChars = options.maxCharacters || BATCH_CONFIG.DEFAULT_MAX_CHARACTERS;
    const operationId = options.operationId || 'op-default';

    const batches = [];
    let currentBatchItems = [];
    let currentBatchChars = 0;
    let batchIndex = 0;

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const unitChars = unit.characterCount || 0;

      const wouldExceedItems = (currentBatchItems.length + 1) > maxItems;
      const wouldExceedChars = (currentBatchChars + unitChars) > maxChars;

      // Start new batch if limits would be exceeded (and current batch is not empty)
      if (currentBatchItems.length > 0 && (wouldExceedItems || wouldExceedChars)) {
        batches.push({
          batchId: `${operationId}-batch-${batchIndex++}`,
          operationId: operationId,
          items: currentBatchItems,
          totalCharacters: currentBatchChars
        });
        currentBatchItems = [];
        currentBatchChars = 0;
      }

      currentBatchItems.push({
        id: unit.id,
        text: unit.text
      });
      currentBatchChars += unitChars;
    }

    if (currentBatchItems.length > 0) {
      batches.push({
        batchId: `${operationId}-batch-${batchIndex}`,
        operationId: operationId,
        items: currentBatchItems,
        totalCharacters: currentBatchChars
      });
    }

    return batches;
  }

  /**
   * Manages original text values and tracks nodes modified during translation.
   * Provides atomic, safe restoration without page reloads.
   */
  class OriginalTextStore {
    constructor() {
      // Map<Node, string> - stores original text per node
      this.originalMap = new Map();
      // Set<Node> - tracks nodes that have been modified by translation
      this.modifiedNodes = new Set();
    }

    /**
     * Registers original text for a node if not already tracked.
     *
     * @param {Node} node
     * @param {string} [text]
     */
    registerOriginal(node, text) {
      if (!this.originalMap.has(node)) {
        this.originalMap.set(node, text !== undefined ? text : node.nodeValue);
      }
    }

    /**
     * Records that a node's value was changed.
     *
     * @param {Node} node
     */
    markModified(node) {
      this.modifiedNodes.add(node);
    }

    /**
     * Returns original text for a node.
     *
     * @param {Node} node
     * @returns {string|undefined}
     */
    getOriginal(node) {
      return this.originalMap.get(node);
    }

    /**
     * Checks if a node has a recorded original value.
     *
     * @param {Node} node
     * @returns {boolean}
     */
    hasOriginal(node) {
      return this.originalMap.has(node);
    }

    /**
     * Checks if a node has been modified by translation.
     *
     * @param {Node} node
     * @returns {boolean}
     */
    isModified(node) {
      return this.modifiedNodes.has(node);
    }

    /**
     * Restores all modified nodes back to their original text.
     * Disconnected or removed nodes are safely handled without throwing.
     *
     * @returns {number} Number of nodes restored
     */
    restoreAll() {
      let restoredCount = 0;

      for (const node of this.modifiedNodes) {
        if (!node) continue;

        const original = this.originalMap.get(node);
        if (original !== undefined && node.nodeValue !== original) {
          try {
            // Check if node is still connected to document before writing
            if (node.isConnected !== false) {
              node.nodeValue = original;
              restoredCount++;
            }
          } catch (err) {
            console.warn('[Roman Urdu Translator] Error restoring node:', err);
          }
        }
      }

      this.modifiedNodes.clear();
      return restoredCount;
    }

    /**
     * Number of nodes with original text recorded.
     *
     * @returns {number}
     */
    size() {
      return this.originalMap.size;
    }

    /**
     * Number of nodes currently modified.
     *
     * @returns {number}
     */
    modifiedCount() {
      return this.modifiedNodes.size;
    }

    /**
     * Clears all tracking.
     */
    clear() {
      this.originalMap.clear();
      this.modifiedNodes.clear();
    }
  }

  /**
   * Safely applies a translation result item to its corresponding DOM text node.
   * Performs defensive validations:
   * 1. Unit exists in nodeMap
   * 2. Node exists and is connected to the DOM
   * 3. Current node text equals original text (integrity check)
   *
   * @param {Object} result - Result item from batch response { id, originalText, translatedText }
   * @param {Map<string, Object>} nodeMap - Mapping of unitId -> TranslationUnit
   * @param {OriginalTextStore} originalStore - Store maintaining original text
   * @returns {Object} Application status { success, unitId, reason }
   */
  function applyTranslationResult(result, nodeMap, originalStore) {
    if (!result || !result.id) {
      return { success: false, reason: 'INVALID_RESULT_OBJECT' };
    }

    const unit = nodeMap.get(result.id);
    if (!unit) {
      return { success: false, unitId: result.id, reason: 'UNIT_NOT_FOUND_IN_MAP' };
    }

    const node = unit.nodeReference;
    if (!node || node.nodeType !== 3) {
      return { success: false, unitId: result.id, reason: 'INVALID_NODE_REFERENCE' };
    }

    // Check if node is still part of the document tree
    if (typeof node.isConnected === 'boolean' && !node.isConnected) {
      return { success: false, unitId: result.id, reason: 'NODE_DISCONNECTED_FROM_DOM' };
    }

    // Integrity check: verify the node's current text matches what translation was based on
    // If text was modified by user or external scripts, do not overwrite with stale translation
    const currentText = node.nodeValue;
    if (currentText !== unit.originalText && currentText !== result.originalText) {
      return { success: false, unitId: result.id, reason: 'NODE_TEXT_CHANGED_EXTERNALLY' };
    }

    try {
      // Ensure original text is recorded before mutating
      originalStore.registerOriginal(node, unit.originalText);

      // Apply translated text
      node.nodeValue = result.translatedText;
      originalStore.markModified(node);

      return { success: true, unitId: result.id };
    } catch (err) {
      return { success: false, unitId: result.id, reason: err.message || 'MUTATION_FAILED' };
    }
  }

  /**
   * Traverses a DOM tree, extracts eligible text nodes into structured TranslationUnits,
   * and registers them with unique IDs for a given operation.
   *
   * @param {Element|Document} root - DOM root element
   * @param {string} operationId - Operation identifier
   * @param {Object} [options]
   * @param {OriginalTextStore} [options.store] - Store to record original text
   * @param {WeakSet} [options.processedSet] - Set of already processed nodes
   * @param {Window} [win] - Window object
   * @returns {Object} { units, skippedCount, totalNodes, characters, nodeMap }
   */
  function extractTranslationUnits(root, operationId, options = {}, win) {
    const currentWindow = win || (typeof window !== 'undefined' ? window : null);
    const doc = (root && root.ownerDocument) ? root.ownerDocument : (typeof document !== 'undefined' ? document : null);

    if (!root || !doc) {
      return { units: [], skippedCount: 0, totalNodes: 0, characters: 0, nodeMap: new Map() };
    }

    const store = options.store || null;
    const processedSet = options.processedSet || null;

    const units = [];
    const nodeMap = new Map();
    let totalNodes = 0;
    let skippedCount = 0;
    let totalCharacters = 0;

    // NodeFilter.SHOW_TEXT = 4
    const walker = doc.createTreeWalker(root, 4, null, false);
    let currentNode = walker.nextNode();
    let unitIndex = 0;

    while (currentNode) {
      const rawText = currentNode.nodeValue;
      const trimmed = rawText ? rawText.trim() : '';

      if (trimmed.length > 0) {
        totalNodes++;

        // Duplicate prevention: skip if already processed in this operation or already modified
        const alreadyProcessed = processedSet && processedSet.has(currentNode);
        const alreadyModified = store && store.isModified(currentNode);

        if (!alreadyProcessed && !alreadyModified && isEligibleTextNode(currentNode, currentWindow)) {
          const unit = createTranslationUnit(currentNode, unitIndex++, operationId);
          units.push(unit);
          nodeMap.set(unit.id, unit);
          totalCharacters += unit.characterCount;

          if (store) {
            store.registerOriginal(currentNode, unit.originalText);
          }
          if (processedSet) {
            processedSet.add(currentNode);
          }
        } else {
          skippedCount++;
        }
      }

      currentNode = walker.nextNode();
    }

    return {
      units,
      skippedCount,
      totalNodes,
      characters: totalCharacters,
      nodeMap
    };
  }

  /**
   * Development-Only Mock Translator.
   *
   * IMPORTANT:
   * This is NOT the Roman Urdu translation engine.
   * Its only purpose is to test the asynchronous batching, mapping, application,
   * and restoration pipeline without calling external APIs.
   *
   * Adheres strictly to the Translation Contract:
   * Input:  { batchId, operationId, items: [{ id, text }] }
   * Output: { batchId, operationId, results: [{ id, originalText, translatedText }] }
   *
   * @param {Object} batch - Batch descriptor
   * @param {Object} [options]
   * @param {boolean} [options.reorderResults=false] - For testing out-of-order response mapping
   * @returns {Promise<Object>} Batch response adhering to contract
   */
  async function mockTranslateBatch(batch, options = {}) {
    if (!batch || !Array.isArray(batch.items)) {
      throw new Error('Invalid batch format for mock translation');
    }

    // Deterministic mock transformation: clearly marked as development-only
    let results = batch.items.map((item) => ({
      id: item.id,
      originalText: item.text,
      translatedText: `[MOCK TRANSLATION] ${item.text}`
    }));

    // Support intentional reordering to verify result-ID based mapping
    if (options.reorderResults && results.length > 1) {
      results = [...results].reverse();
    }

    return {
      batchId: batch.batchId,
      operationId: batch.operationId,
      results
    };
  }

  /**
   * Checks if a DOM node is currently within or near the visible browser viewport.
   * For text nodes, checks the parent element's bounding rectangle.
   *
   * @param {Node|null} node - DOM node (element or text node)
   * @param {Window} [win] - Window context
   * @param {number} [bufferRatio=0.2] - Fractional viewport buffer above/below the fold (default: 20%)
   * @returns {boolean} True if within visible viewport range
   */
  function isNodeInViewport(node, win, bufferRatio = 0.2) {
    if (!node) return false;
    const currentWindow = win || (typeof window !== 'undefined' ? window : null);
    if (!currentWindow) return false;

    // For text nodes, use parentElement; for elements, use node directly
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element) return false;

    if (typeof element.getBoundingClientRect !== 'function') {
      // In non-DOM testing environments without getBoundingClientRect, default to true
      return true;
    }

    try {
      const rect = element.getBoundingClientRect();
      const viewportHeight = currentWindow.innerHeight ||
        (currentWindow.document && currentWindow.document.documentElement
          ? currentWindow.document.documentElement.clientHeight
          : 800);
      const viewportWidth = currentWindow.innerWidth ||
        (currentWindow.document && currentWindow.document.documentElement
          ? currentWindow.document.documentElement.clientWidth
          : 1200);

      // If bounding rect has zero dimensions and no position, node might not be rendered or in a headless test
      if (rect.top === 0 && rect.bottom === 0 && rect.left === 0 && rect.right === 0 && rect.width === 0 && rect.height === 0) {
        return false;
      }

      const bufferY = viewportHeight * bufferRatio;
      const bufferX = viewportWidth * bufferRatio;

      // In viewport if vertically and horizontally overlapping the extended viewport box
      const inVertical = rect.bottom >= -bufferY && rect.top <= viewportHeight + bufferY;
      const inHorizontal = rect.right >= -bufferX && rect.left <= viewportWidth + bufferX;

      return inVertical && inHorizontal;
    } catch (e) {
      return false;
    }
  }

  /**
   * Partitions translation units into visible (above-the-fold) and background (below-the-fold) groups.
   *
   * @param {Array<Object>} units - List of translation units
   * @param {Map<string, Object>|Map<string, Node>} [activeNodeMap] - Map of unit IDs to units or nodes
   * @param {Window} [win] - Window context
   * @param {number} [bufferRatio=0.2] - Viewport buffer
   * @returns {{ visibleUnits: Array<Object>, backgroundUnits: Array<Object> }}
   */
  function partitionUnitsByVisibility(units, activeNodeMap, win, bufferRatio = 0.2) {
    if (!Array.isArray(units) || units.length === 0) {
      return { visibleUnits: [], backgroundUnits: [] };
    }

    const currentWindow = win || (typeof window !== 'undefined' ? window : null);
    const visibleUnits = [];
    const backgroundUnits = [];

    for (const unit of units) {
      let node = unit.nodeReference;
      if (!node && activeNodeMap && activeNodeMap.get) {
        const item = activeNodeMap.get(unit.id);
        node = item && item.nodeReference ? item.nodeReference : item;
      }

      if (isNodeInViewport(node, currentWindow, bufferRatio)) {
        visibleUnits.push(unit);
      } else {
        backgroundUnits.push(unit);
      }
    }

    return { visibleUnits, backgroundUnits };
  }

  /**
   * Phase 1 compatibility wrapper: inspects page text without mutating DOM.
   *
   * @param {Element|Document} root
   * @param {OriginalTextStore} [textStore]
   * @param {Window} [win]
   * @returns {Object}
   */
  function inspectPageText(root, textStore, win) {
    const extraction = extractTranslationUnits(root, 'inspect', { store: textStore }, win);
    return {
      totalNodes: extraction.totalNodes,
      eligibleNodes: extraction.units.length,
      skippedNodes: extraction.skippedCount,
      characters: extraction.characters,
      eligibleNodeList: extraction.units.map(u => u.nodeReference)
    };
  }

  return {
    PROTECTED_TAGS,
    BATCH_CONFIG,
    PIPELINE_STATES,
    isElementProtected,
    isElementVisible,
    isEligibleTextNode,
    isNodeInViewport,
    partitionUnitsByVisibility,
    normalizeText,
    createTranslationUnit,
    createBatches,
    OriginalTextStore,
    applyTranslationResult,
    extractTranslationUnits,
    mockTranslateBatch,
    inspectPageText
  };
});
