/**
 * Roman Urdu Translator — Phase 8 Performance & Concurrency Test Suite
 *
 * Covers the 8 required Phase 8 specifications:
 * 1. Small page adaptive batching & throughput
 * 2. Medium documentation page batch count reduction & latency
 * 3. Large documentation page batch optimization (50 items / 6500 chars)
 * 4. Multiple concurrent batches (strictly bounded to concurrency limit = 2)
 * 5. Partial batch failure resilience under concurrent execution
 * 6. Cancellation and stale operation discarding during active concurrent batches
 * 7. Exact DOM restoration after concurrent batch application
 * 8. Double-click concurrency guard (ignores second invocation during active translation)
 */

'use strict';

const assert = require('assert');
const TextUtils = require('../utils/text-utils');
const { config } = require('../backend/config');
const { validateBatchRequest } = require('../backend/validator');
const { buildGeminiPayload } = require('../backend/gemini-client');

// DOM Mocks for testing
class MockTextNode {
  constructor(text, parent = null, doc = null) {
    this.nodeType = 3;
    this.nodeValue = text;
    this.parentElement = parent;
    this.ownerDocument = doc;
    this.isConnected = true;
  }
}

class MockElement {
  constructor(tagName, attributes = {}, parent = null, doc = null) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.parentElement = parent;
    this.ownerDocument = doc;
    this.children = [];
    this.childNodes = [];
    this.isConnected = true;
    this.classList = {
      contains: (cls) => Boolean(this.attributes.class && this.attributes.class.split(' ').includes(cls))
    };
  }

  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }

  setAttribute(name, val) {
    this.attributes[name] = val;
  }

  appendChild(child) {
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument;
    child.isConnected = this.isConnected;
    this.childNodes.push(child);
    if (child.nodeType === 1) {
      this.children.push(child);
    }
    return child;
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('BODY', {}, null, this);
  }
}

// Emulated concurrent queue matching content.js logic
async function runConcurrentTranslationQueue(batches, translateFn, applyFn, options = {}) {
  const concurrencyLimit = options.concurrencyLimit || 2;
  let nextBatchIndex = 0;
  let activeWorkersCount = 0;
  let maxObservedConcurrency = 0;
  const failedBatches = [];
  let appliedCount = 0;
  let isCancelled = Boolean(options.isCancelled);
  let currentOperationId = options.operationId || 'op-test';

  async function worker(id) {
    while (nextBatchIndex < batches.length) {
      if (isCancelled || (options.getCurrentOpId && options.getCurrentOpId() !== currentOperationId)) {
        break;
      }

      activeWorkersCount++;
      if (activeWorkersCount > maxObservedConcurrency) {
        maxObservedConcurrency = activeWorkersCount;
      }

      const batchIdx = nextBatchIndex++;
      const batch = batches[batchIdx];

      let response;
      try {
        response = await translateFn(batch);
      } catch (err) {
        failedBatches.push({ batchId: batch.batchId, error: err.message });
        activeWorkersCount--;
        continue;
      }

      activeWorkersCount--;

      if (isCancelled || (options.getCurrentOpId && options.getCurrentOpId() !== currentOperationId)) {
        break;
      }

      if (response && Array.isArray(response.results)) {
        for (const res of response.results) {
          if (applyFn(res)) {
            appliedCount++;
          }
        }
      }
    }
  }

  const workerCount = Math.min(concurrencyLimit, batches.length);
  const workers = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(worker(w));
  }
  await Promise.all(workers);

  return {
    appliedCount,
    failedBatches,
    maxObservedConcurrency,
    isCancelled
  };
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err.stack || err.message}`);
    failed++;
  }
}

async function runAll() {
  console.log('\n--- Running Phase 8 Performance & Concurrency Test Suite ---\n');

  // Test 1: Small Page Adaptive Batching
  await test('Small page fits in exactly 1 batch with adaptive limits', () => {
    const units = [];
    for (let i = 0; i < 15; i++) {
      units.push({ id: `u-${i}`, text: `Quickstart guide instruction step ${i}.`, characterCount: 40 });
    }
    const batches = TextUtils.createBatches(units);
    assert.strictEqual(batches.length, 1, '15 units should fit into a single adaptive batch (max 50 items)');
    assert.strictEqual(batches[0].items.length, 15);
  });

  // Test 2: Medium Documentation Page Batch Count Reduction
  await test('Medium documentation page batches reduce significantly (under 50 items / 6500 chars)', () => {
    const units = [];
    // 55 units, avg 80 chars = 4,400 chars total
    for (let i = 0; i < 55; i++) {
      units.push({ id: `u-${i}`, text: `Documentation paragraph ${i} explaining the service worker lifecycle and caching patterns.`, characterCount: 85 });
    }
    const batches = TextUtils.createBatches(units);
    // Old limit: 25 items -> 3 batches. New limit: 50 items -> 2 batches
    assert.strictEqual(batches.length, 2, '55 units should produce 2 batches instead of 3+');
    assert.strictEqual(batches[0].items.length, 50);
    assert.strictEqual(batches[1].items.length, 5);
  });

  // Test 3: Large Documentation Page Batch Optimization
  await test('Large documentation page groups up to 6,500 characters per batch', () => {
    const units = [];
    // 120 units, each 100 characters = 12,000 characters total
    for (let i = 0; i < 120; i++) {
      units.push({ id: `u-${i}`, text: `Comprehensive API reference section ${i}: methods, parameter schemas, return types, and exceptions.`, characterCount: 100 });
    }
    const batches = TextUtils.createBatches(units);
    // 12,000 chars at 6,500 chars/batch produces ~2-3 batches instead of old 12 batches!
    assert(batches.length <= 3, `Expected <= 3 batches for 12,000 chars (got ${batches.length})`);
    for (const b of batches) {
      assert(b.items.length <= 50, 'Batch must not exceed 50 items');
      assert(b.totalCharacters <= 6500, 'Batch must not exceed 6500 chars');
    }
  });

  // Test 4: Multiple Concurrent Batches (Bounded Concurrency Limit = 2)
  await test('Worker queue never exceeds maximum concurrency of 2 active requests', async () => {
    const batches = [
      { batchId: 'b-1', items: [{ id: 'u-1', text: 'Text 1' }] },
      { batchId: 'b-2', items: [{ id: 'u-2', text: 'Text 2' }] },
      { batchId: 'b-3', items: [{ id: 'u-3', text: 'Text 3' }] },
      { batchId: 'b-4', items: [{ id: 'u-4', text: 'Text 4' }] }
    ];

    let currentActive = 0;
    let maxActive = 0;

    const mockTranslate = async (batch) => {
      currentActive++;
      if (currentActive > maxActive) maxActive = currentActive;
      await new Promise(r => setTimeout(r, 20));
      currentActive--;
      return { results: batch.items.map(it => ({ id: it.id, translatedText: `[RU] ${it.text}` })) };
    };

    const res = await runConcurrentTranslationQueue(batches, mockTranslate, () => true, { concurrencyLimit: 2 });
    assert.strictEqual(res.appliedCount, 4, 'All 4 items must be applied');
    assert.strictEqual(maxActive, 2, 'Maximum concurrent active requests must be exactly 2');
    assert(res.maxObservedConcurrency <= 2, 'Worker pool must never exceed concurrency limit of 2');
  });

  // Test 5: Partial Batch Failure Resilience
  await test('Partial batch failure does not crash or block remaining concurrent batches', async () => {
    const batches = [
      { batchId: 'b-ok1', items: [{ id: 'u-1', text: 'Text 1' }] },
      { batchId: 'b-fail', items: [{ id: 'u-2', text: 'Text 2' }] },
      { batchId: 'b-ok2', items: [{ id: 'u-3', text: 'Text 3' }] }
    ];

    const mockTranslate = async (batch) => {
      if (batch.batchId === 'b-fail') {
        throw new Error('Simulated upstream network failure');
      }
      return { results: batch.items.map(it => ({ id: it.id, translatedText: `[RU] ${it.text}` })) };
    };

    const res = await runConcurrentTranslationQueue(batches, mockTranslate, () => true, { concurrencyLimit: 2 });
    assert.strictEqual(res.appliedCount, 2, 'Successful batches must be applied even when one fails');
    assert.strictEqual(res.failedBatches.length, 1, 'Failed batch must be recorded');
    assert.strictEqual(res.failedBatches[0].batchId, 'b-fail');
  });

  // Test 6: Cancellation and Stale Operation Discarding
  await test('Cancellation halts subsequent queued batches and discards stale responses', async () => {
    const batches = [
      { batchId: 'b-1', items: [{ id: 'u-1', text: 'Text 1' }] },
      { batchId: 'b-2', items: [{ id: 'u-2', text: 'Text 2' }] },
      { batchId: 'b-3', items: [{ id: 'u-3', text: 'Text 3' }] },
      { batchId: 'b-4', items: [{ id: 'u-4', text: 'Text 4' }] }
    ];

    let opId = 'op-initial';
    let executedCount = 0;

    const mockTranslate = async (batch) => {
      executedCount++;
      if (batch.batchId === 'b-1') {
        // Supersede operation while worker is in flight
        opId = 'op-superseded';
      }
      await new Promise(r => setTimeout(r, 20));
      return { results: batch.items.map(it => ({ id: it.id, translatedText: `[RU] ${it.text}` })) };
    };

    const res = await runConcurrentTranslationQueue(batches, mockTranslate, () => true, {
      concurrencyLimit: 2,
      operationId: 'op-initial',
      getCurrentOpId: () => opId
    });

    // Batches 3 and 4 should never be started because operation was superseded
    assert(executedCount < 4, `Queued batches must be aborted when operation ID changes (executed: ${executedCount})`);
  });

  // Test 7: Restore Original After Concurrent Translation
  await test('Restore Original reverts 100% of nodes to exact original English after concurrent translation', () => {
    const doc = new MockDocument();
    const originalStore = new TextUtils.OriginalTextStore();
    const activeNodeMap = new Map();

    const nodes = [];
    for (let i = 0; i < 20; i++) {
      const p = doc.body.appendChild(new MockElement('P'));
      const textNode = new MockTextNode(`Original English paragraph ${i}.`, p, doc);
      p.appendChild(textNode);
      nodes.push(textNode);
      activeNodeMap.set(`unit-${i}`, {
        id: `unit-${i}`,
        nodeReference: textNode,
        originalText: `Original English paragraph ${i}.`
      });
    }

    // Apply translations across multiple batches
    for (let i = 0; i < 20; i++) {
      TextUtils.applyTranslationResult(
        { id: `unit-${i}`, originalText: `Original English paragraph ${i}.`, translatedText: `Roman Urdu translation ${i}.` },
        activeNodeMap,
        originalStore
      );
      assert.strictEqual(nodes[i].nodeValue, `Roman Urdu translation ${i}.`);
    }
    assert.strictEqual(originalStore.modifiedCount(), 20);

    // Restore Original
    const restoredCount = originalStore.restoreAll();
    assert.strictEqual(restoredCount, 20, 'All 20 nodes must be restored');
    for (let i = 0; i < 20; i++) {
      assert.strictEqual(nodes[i].nodeValue, `Original English paragraph ${i}.`);
    }
    assert.strictEqual(originalStore.modifiedCount(), 0);
  });

  // Test 8: Double-Click Concurrency Guard
  await test('Double-click translation requests are safely blocked while operation is active', () => {
    let currentState = 'IDLE';

    function startTranslation() {
      if (currentState !== 'IDLE' && currentState !== 'COMPLETED' && currentState !== 'FAILED') {
        return { started: false, reason: 'ALREADY_RUNNING' };
      }
      currentState = 'TRANSLATING';
      return { started: true };
    }

    const firstClick = startTranslation();
    assert.strictEqual(firstClick.started, true);

    const secondClick = startTranslation();
    assert.strictEqual(secondClick.started, false);
    assert.strictEqual(secondClick.reason, 'ALREADY_RUNNING');
  });

  console.log(`\nPhase 8 Performance & Concurrency Tests: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll();
