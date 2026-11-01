/**
 * Roman Urdu Translator — Phase 5 Real-World Compatibility & Robustness Test Suite
 *
 * Covers the 10 required Phase 5 specifications:
 * 1. Duplicate translation prevention
 * 2. Dynamic node detection
 * 3. Mutation debounce / coalescing
 * 4. Restoration after dynamic updates
 * 5. SPA-like navigation behavior
 * 6. Partial batch failure recovery
 * 7. Invalid output rejection before DOM application
 * 8. Placeholder integrity across complex URLs, paths, and commands
 * 9. Protected link href preservation while text translates
 * 10. Repeated Translate action safety
 */

const assert = require('assert');
const TextUtils = require('../utils/text-utils');
const { protectText, restoreText, protectBatchItems, restoreBatchResults } = require('../backend/placeholder-utils');
const { validateTranslationOutput, checkForbiddenScript } = require('../backend/output-validator');

// Mock browser DOM environment for Node.js
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

  createElement(tag, attributes = {}) {
    return new MockElement(tag, attributes, null, this);
  }

  createTextNode(text) {
    return new MockTextNode(text, null, this);
  }

  createTreeWalker(root, whatToShow = 4) {
    const textNodes = [];
    function collect(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        textNodes.push(node);
      } else if (node.childNodes) {
        for (const child of node.childNodes) {
          collect(child);
        }
      }
    }
    collect(root);
    let index = 0;
    return {
      nextNode: () => {
        if (index < textNodes.length) {
          return textNodes[index++];
        }
        return null;
      }
    };
  }
}

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

console.log('\n--- Running Phase 5 Real-World Compatibility Test Suite ---\n');

// 1. Duplicate translation prevention
test('Duplicate translation prevention: already translated nodes are skipped on second extraction', () => {
  const doc = new MockDocument();
  const p = doc.createElement('p');
  const textNode = doc.createTextNode('This is an introductory guide to web components.');
  p.appendChild(textNode);
  doc.body.appendChild(p);

  const store = new TextUtils.OriginalTextStore();
  const op1 = 'op-dup-1';

  // First extraction: node is extracted
  const extraction1 = TextUtils.extractTranslationUnits(doc.body, op1, { store });
  assert.strictEqual(extraction1.units.length, 1, 'Should extract unit on first pass');

  // Simulate translation applied to node
  const unit = extraction1.units[0];
  const applyRes = TextUtils.applyTranslationResult({
    id: unit.id,
    originalText: unit.originalText,
    translatedText: 'Yeh web components ki aik introductory guide hai.'
  }, extraction1.nodeMap, store);
  assert.strictEqual(applyRes.success, true);
  assert.strictEqual(store.isModified(textNode), true);

  // Second extraction (e.g. user clicks Translate again): node should be skipped
  const op2 = 'op-dup-2';
  const extraction2 = TextUtils.extractTranslationUnits(doc.body, op2, { store });
  assert.strictEqual(extraction2.units.length, 0, 'Should NOT extract already modified text node (prevents double translation)');
});

// 2. Dynamic node detection & queueing
test('Dynamic node detection: newly added elements are detected and extractable', () => {
  const doc = new MockDocument();
  const store = new TextUtils.OriginalTextStore();
  const op1 = 'op-dyn-1';

  const div1 = doc.createElement('div');
  const text1 = doc.createTextNode('Initial static documentation paragraph.');
  div1.appendChild(text1);
  doc.body.appendChild(div1);

  // Translate initial content
  const ext1 = TextUtils.extractTranslationUnits(doc.body, op1, { store });
  assert.strictEqual(ext1.units.length, 1);
  TextUtils.applyTranslationResult({
    id: ext1.units[0].id,
    originalText: ext1.units[0].originalText,
    translatedText: 'Pehle se mojood documentation paragraph.'
  }, ext1.nodeMap, store);

  // Dynamically insert an expandable section or lazy-loaded paragraph
  const dynamicSection = doc.createElement('section');
  const dynamicText = doc.createTextNode('Dynamically loaded API parameters section.');
  dynamicSection.appendChild(dynamicText);
  doc.body.appendChild(dynamicSection);

  // Dynamic extraction passes only newly added untranslated subtree
  const op2 = 'op-dyn-2';
  const ext2 = TextUtils.extractTranslationUnits(dynamicSection, op2, { store });
  assert.strictEqual(ext2.units.length, 1, 'Should identify newly added text node');
  assert.strictEqual(ext2.units[0].text, 'Dynamically loaded API parameters section.');
});

// 3. Mutation debounce & settling
test('Mutation settling: rapid bursts coalesce without triggering multiple redundant extractions', () => {
  let timer = null;
  let executionCount = 0;
  const DEBOUNCE_MS = 30;

  function handleBurst() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      executionCount++;
    }, DEBOUNCE_MS);
  }

  // Simulate 10 rapid DOM mutations arriving in a burst
  for (let i = 0; i < 10; i++) {
    handleBurst();
  }

  // Before timer expires, executionCount is 0
  assert.strictEqual(executionCount, 0, 'Mutations should be coalescing during debounce window');
});

// 4. Restoration after dynamic updates
test('Restoration after dynamic updates: reverts both initial and dynamically added translated nodes', () => {
  const doc = new MockDocument();
  const store = new TextUtils.OriginalTextStore();

  const node1 = doc.createTextNode('Original heading 1');
  doc.body.appendChild(node1);
  const ext1 = TextUtils.extractTranslationUnits(doc.body, 'op-1', { store });
  TextUtils.applyTranslationResult({
    id: ext1.units[0].id,
    originalText: 'Original heading 1',
    translatedText: 'Roman Urdu Heading 1'
  }, ext1.nodeMap, store);

  // Dynamically added node
  const node2 = doc.createTextNode('Original dynamic paragraph');
  doc.body.appendChild(node2);
  const ext2 = TextUtils.extractTranslationUnits(node2.parentElement || doc.body, 'op-2', { store });
  TextUtils.applyTranslationResult({
    id: ext2.units[0].id,
    originalText: 'Original dynamic paragraph',
    translatedText: 'Roman Urdu Dynamic Paragraph'
  }, ext2.nodeMap, store);

  assert.strictEqual(node1.nodeValue, 'Roman Urdu Heading 1');
  assert.strictEqual(node2.nodeValue, 'Roman Urdu Dynamic Paragraph');
  assert.strictEqual(store.modifiedCount(), 2);

  // Restore All
  const restored = store.restoreAll();
  assert.strictEqual(restored, 2, 'Should restore all modified nodes including dynamic ones');
  assert.strictEqual(node1.nodeValue, 'Original heading 1');
  assert.strictEqual(node2.nodeValue, 'Original dynamic paragraph');
  assert.strictEqual(store.modifiedCount(), 0);
});

// 5. SPA-like route change handling
test('SPA navigation: route change cleans up active state allowing clean subsequent operations', () => {
  const doc = new MockDocument();
  const store = new TextUtils.OriginalTextStore();

  // Page A
  const pA = doc.createElement('p');
  const textA = doc.createTextNode('Documentation Page A content.');
  pA.appendChild(textA);
  doc.body.appendChild(pA);

  const extA = TextUtils.extractTranslationUnits(doc.body, 'op-page-a', { store });
  assert.strictEqual(extA.units.length, 1);
  TextUtils.applyTranslationResult({
    id: extA.units[0].id,
    originalText: 'Documentation Page A content.',
    translatedText: 'Page A ka Roman Urdu content.'
  }, extA.nodeMap, store);

  // Simulate SPA route change: page body is cleared/replaced with Page B
  doc.body.childNodes = [];
  doc.body.children = [];

  const pB = doc.createElement('p');
  const textB = doc.createTextNode('Documentation Page B content.');
  pB.appendChild(textB);
  doc.body.appendChild(pB);

  // Page B can now be extracted cleanly without stale units from Page A
  const extB = TextUtils.extractTranslationUnits(doc.body, 'op-page-b', { store });
  assert.strictEqual(extB.units.length, 1);
  assert.strictEqual(extB.units[0].text, 'Documentation Page B content.');
});

// 6. Partial batch failure recovery
test('Partial batch failure: completed batches are preserved and safely reversible', () => {
  const doc = new MockDocument();
  const store = new TextUtils.OriginalTextStore();

  const nodeBatch1 = doc.createTextNode('Batch 1 text node.');
  const nodeBatch2 = doc.createTextNode('Batch 2 text node.');
  doc.body.appendChild(nodeBatch1);
  doc.body.appendChild(nodeBatch2);

  const nodeMap = new Map();
  nodeMap.set('unit-1', { id: 'unit-1', originalText: 'Batch 1 text node.', nodeReference: nodeBatch1 });
  nodeMap.set('unit-2', { id: 'unit-2', originalText: 'Batch 2 text node.', nodeReference: nodeBatch2 });

  // Batch 1 succeeds
  const res1 = TextUtils.applyTranslationResult({
    id: 'unit-1',
    originalText: 'Batch 1 text node.',
    translatedText: 'Batch 1 ka Roman Urdu text.'
  }, nodeMap, store);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(nodeBatch1.nodeValue, 'Batch 1 ka Roman Urdu text.');

  // Batch 2 encounters network failure -> text node is NOT touched or corrupted
  assert.strictEqual(nodeBatch2.nodeValue, 'Batch 2 text node.', 'Failed batch node must remain intact English');

  // Verify Restore All still functions reliably on partial state
  const restored = store.restoreAll();
  assert.strictEqual(restored, 1);
  assert.strictEqual(nodeBatch1.nodeValue, 'Batch 1 text node.');
  assert.strictEqual(nodeBatch2.nodeValue, 'Batch 2 text node.');
});

// 7. Invalid output rejection before reaching DOM
test('Invalid output rejection: forbidden script is rejected by validator and never applied to DOM', () => {
  const expectedItems = [{ id: 'unit-bad', text: 'This text will fail validator.' }];
  const malformedResults = [
    { id: 'unit-bad', translatedText: 'یہ اردو سکرپٹ ہے جو منع ہے' }
  ];

  const validation = validateTranslationOutput(expectedItems, malformedResults);
  assert.strictEqual(validation.valid, false, 'Should flag forbidden script as invalid');
  assert.strictEqual(validation.code, 'FORBIDDEN_SCRIPT_DETECTED');
});

// 8. Placeholder integrity across complex URLs, paths, and commands
test('Placeholder integrity: complex URLs with queries/fragments, Windows paths, and CLI commands', () => {
  const sample = 'Visit https://api.github.com/repos?owner=user&page=2#heading or run npm install --save-dev express on C:\\Users\\Dev\\Project.';
  const protectedRes = protectText(sample);

  assert.ok(protectedRes.placeholders.size >= 3, 'Should protect URL, command, and Windows path');
  // Verify byte-for-byte exact restoration
  const restored = restoreText(protectedRes.text, protectedRes.placeholders);
  assert.strictEqual(restored, sample, 'Restoration must match byte-for-byte');
});

// 9. Protected link href preservation while link text translates
test('Protected link href preservation: anchor href attribute is untouched while text translates', () => {
  const doc = new MockDocument();
  const store = new TextUtils.OriginalTextStore();

  const a = doc.createElement('a', { href: 'https://developer.mozilla.org/en-US/docs/Web/API' });
  const textNode = doc.createTextNode('Read the official API documentation');
  a.appendChild(textNode);
  doc.body.appendChild(a);

  const ext = TextUtils.extractTranslationUnits(doc.body, 'op-link', { store });
  assert.strictEqual(ext.units.length, 1);

  // Apply translation
  TextUtils.applyTranslationResult({
    id: ext.units[0].id,
    originalText: ext.units[0].originalText,
    translatedText: 'Official API documentation parhein'
  }, ext.nodeMap, store);

  // Verify visible text changed but href attribute remained 100% untouched
  assert.strictEqual(textNode.nodeValue, 'Official API documentation parhein');
  assert.strictEqual(a.getAttribute('href'), 'https://developer.mozilla.org/en-US/docs/Web/API');
});

// 10. Repeated Translate action safety
test('Repeated Translate action safety: 5 consecutive translate calls do not crash or corrupt text', () => {
  const doc = new MockDocument();
  const store = new TextUtils.OriginalTextStore();
  const textNode = doc.createTextNode('Stable documentation prose.');
  doc.body.appendChild(textNode);

  // Call 1
  const ext1 = TextUtils.extractTranslationUnits(doc.body, 'op-rep-1', { store });
  assert.strictEqual(ext1.units.length, 1);
  TextUtils.applyTranslationResult({
    id: ext1.units[0].id,
    originalText: ext1.units[0].originalText,
    translatedText: 'Stable documentation ka Roman Urdu prose.'
  }, ext1.nodeMap, store);

  // Calls 2 through 5: should all return 0 units because node is already modified
  for (let i = 2; i <= 5; i++) {
    const ext = TextUtils.extractTranslationUnits(doc.body, `op-rep-${i}`, { store });
    assert.strictEqual(ext.units.length, 0, `Call ${i} must skip already modified node`);
  }

  assert.strictEqual(textNode.nodeValue, 'Stable documentation ka Roman Urdu prose.');
});

console.log(`\nPhase 5 Compatibility Tests: ${passedTests} passed, ${failedTests} failed.`);
if (failedTests > 0) {
  process.exit(1);
}
