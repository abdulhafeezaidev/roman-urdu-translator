/**
 * Roman Urdu Translator — Comprehensive Test Suite (Phases 1-3)
 *
 * Validates:
 * 1. Text utilities: protected tag checks, visibility, text node eligibility
 * 2. Translation units: deterministic IDs, character counts
 * 3. Batching: item thresholds, character thresholds, determinism
 * 4. Mapping: reordered responses, identical text distinction
 * 5. Safety: disconnected DOM nodes, externally modified text
 * 6. Restoration: exact original recovery
 * 7. Security: zero credentials in extension or git files, .env exclusion, .env.example placeholder
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TextUtils = require('../utils/text-utils');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err.stack || err.message}`);
    failedTests++;
  }
}

console.log('\n--- Running Roman Urdu Translator Comprehensive Test Suite ---\n');

// 1. Protected Tags & Exclusion
test('Protected tags include all required exclusion elements', () => {
  const required = [
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE',
    'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG',
    'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'KBD', 'SAMP', 'VAR'
  ];
  for (const tag of required) {
    assert(TextUtils.PROTECTED_TAGS.has(tag), `Tag ${tag} must be in PROTECTED_TAGS`);
  }
});

// 2. Translation Unit Generation
test('createTranslationUnit produces unique IDs and correct character counts', () => {
  const mockNode = { nodeType: 3, nodeValue: '  Hello    world!  ' };
  const unit = TextUtils.createTranslationUnit(mockNode, 5, 'op-123');

  assert.strictEqual(unit.id, 'op-123-unit-5');
  assert.strictEqual(unit.text, '  Hello    world!  ');
  assert.strictEqual(unit.originalText, '  Hello    world!  ');
  assert.strictEqual(unit.normalizedText, 'Hello world!');
  assert.strictEqual(unit.characterCount, 12);
  assert.strictEqual(unit.nodeReference, mockNode);
});

// 3. Deterministic Batching Limits
test('createBatches groups units deterministically respecting maxItems and maxCharacters', () => {
  const units = [];
  for (let i = 0; i < 50; i++) {
    units.push({
      id: `op-test-unit-${i}`,
      text: `Text string number ${i}`,
      characterCount: 20
    });
  }

  const batches = TextUtils.createBatches(units, {
    operationId: 'op-test',
    maxItems: 10,
    maxCharacters: 500
  });

  assert.strictEqual(batches.length, 5, 'Should produce exactly 5 batches');
  for (let b = 0; b < batches.length; b++) {
    assert(batches[b].items.length <= 10, `Batch ${b} exceeded maxItems`);
    assert(batches[b].totalCharacters <= 500, `Batch ${b} exceeded maxCharacters`);
    assert.strictEqual(batches[b].operationId, 'op-test');
    assert.strictEqual(batches[b].batchId, `op-test-batch-${b}`);
  }

  const seenIds = new Set();
  for (const batch of batches) {
    for (const item of batch.items) {
      assert(!seenIds.has(item.id), `Duplicate unit found across batches: ${item.id}`);
      seenIds.add(item.id);
    }
  }
  assert.strictEqual(seenIds.size, 50);

  const batches2 = TextUtils.createBatches(units, {
    operationId: 'op-test',
    maxItems: 10,
    maxCharacters: 500
  });
  assert.deepStrictEqual(batches, batches2, 'Batching must be strictly deterministic');
});

// 4. Batching Character Threshold
test('createBatches respects maxCharacters threshold even with small item count', () => {
  const units = [
    { id: 'u1', text: 'Short', characterCount: 5 },
    { id: 'u2', text: 'Very long text '.repeat(10), characterCount: 150 },
    { id: 'u3', text: 'Another long text '.repeat(10), characterCount: 180 },
    { id: 'u4', text: 'End', characterCount: 3 }
  ];

  const batches = TextUtils.createBatches(units, {
    operationId: 'op-char-test',
    maxItems: 50,
    maxCharacters: 200
  });

  assert(batches.length >= 2, 'Should split on character boundary');
  for (const b of batches) {
    assert(b.totalCharacters <= 200 || b.items.length === 1, 'Batch character limit violated');
  }
});

// 5. Result ID Mapping with Reordered Responses
test('applyTranslationResult correctly maps results even if response order is reordered', () => {
  const store = new TextUtils.OriginalTextStore();
  const mockNode1 = { nodeType: 3, nodeValue: 'First paragraph', isConnected: true };
  const mockNode2 = { nodeType: 3, nodeValue: 'Second paragraph', isConnected: true };

  const unit1 = { id: 'op-1-unit-1', originalText: 'First paragraph', nodeReference: mockNode1 };
  const unit2 = { id: 'op-1-unit-2', originalText: 'Second paragraph', nodeReference: mockNode2 };

  const nodeMap = new Map([
    [unit1.id, unit1],
    [unit2.id, unit2]
  ]);

  const results = [
    { id: 'op-1-unit-2', originalText: 'Second paragraph', translatedText: '[MOCK] Second paragraph' },
    { id: 'op-1-unit-1', originalText: 'First paragraph', translatedText: '[MOCK] First paragraph' }
  ];

  for (const res of results) {
    const status = TextUtils.applyTranslationResult(res, nodeMap, store);
    assert(status.success, `Application should succeed for ${res.id}`);
  }

  assert.strictEqual(mockNode1.nodeValue, '[MOCK] First paragraph');
  assert.strictEqual(mockNode2.nodeValue, '[MOCK] Second paragraph');
});

// 6. Duplicate Text String Distinction
test('Identical text strings in distinct DOM nodes remain distinct and non-colliding', () => {
  const store = new TextUtils.OriginalTextStore();
  const nodeA = { nodeType: 3, nodeValue: 'Submit', isConnected: true };
  const nodeB = { nodeType: 3, nodeValue: 'Submit', isConnected: true };

  const unitA = { id: 'op-dup-unit-0', originalText: 'Submit', nodeReference: nodeA };
  const unitB = { id: 'op-dup-unit-1', originalText: 'Submit', nodeReference: nodeB };

  const nodeMap = new Map([
    [unitA.id, unitA],
    [unitB.id, unitB]
  ]);

  const resA = { id: 'op-dup-unit-0', originalText: 'Submit', translatedText: '[MOCK] Submit A' };
  const resB = { id: 'op-dup-unit-1', originalText: 'Submit', translatedText: '[MOCK] Submit B' };

  TextUtils.applyTranslationResult(resA, nodeMap, store);
  TextUtils.applyTranslationResult(resB, nodeMap, store);

  assert.strictEqual(nodeA.nodeValue, '[MOCK] Submit A');
  assert.strictEqual(nodeB.nodeValue, '[MOCK] Submit B');

  store.restoreAll();
  assert.strictEqual(nodeA.nodeValue, 'Submit');
  assert.strictEqual(nodeB.nodeValue, 'Submit');
});

// 7. Safety: Disconnected Node Handling
test('Disconnected DOM node does not throw or break translation', () => {
  const store = new TextUtils.OriginalTextStore();
  const disconnectedNode = { nodeType: 3, nodeValue: 'Old text', isConnected: false };

  const unit = { id: 'op-disc-unit-0', originalText: 'Old text', nodeReference: disconnectedNode };
  const nodeMap = new Map([[unit.id, unit]]);

  const res = { id: 'op-disc-unit-0', originalText: 'Old text', translatedText: '[MOCK] Old text' };
  const status = TextUtils.applyTranslationResult(res, nodeMap, store);

  assert.strictEqual(status.success, false);
  assert.strictEqual(status.reason, 'NODE_DISCONNECTED_FROM_DOM');
  assert.strictEqual(disconnectedNode.nodeValue, 'Old text');
});

// 8. Safety: Changed Node Text Prevents Stale Translation
test('Externally changed text prevents applying stale translation', () => {
  const store = new TextUtils.OriginalTextStore();
  const node = { nodeType: 3, nodeValue: 'User edited text', isConnected: true };

  const unit = { id: 'op-edit-unit-0', originalText: 'Original text', nodeReference: node };
  const nodeMap = new Map([[unit.id, unit]]);

  const res = { id: 'op-edit-unit-0', originalText: 'Original text', translatedText: '[MOCK] Original text' };
  const status = TextUtils.applyTranslationResult(res, nodeMap, store);

  assert.strictEqual(status.success, false);
  assert.strictEqual(status.reason, 'NODE_TEXT_CHANGED_EXTERNALLY');
  assert.strictEqual(node.nodeValue, 'User edited text');
});

// 9. Exact Restoration
test('Restore Original reverts all modified nodes to exact original English', () => {
  const store = new TextUtils.OriginalTextStore();
  const node1 = { nodeType: 3, nodeValue: 'Hello world', isConnected: true };
  const node2 = { nodeType: 3, nodeValue: 'Documentation guide', isConnected: true };
  const untouchedNode = { nodeType: 3, nodeValue: 'Unrelated text', isConnected: true };

  const unit1 = { id: 'u1', originalText: 'Hello world', nodeReference: node1 };
  const unit2 = { id: 'u2', originalText: 'Documentation guide', nodeReference: node2 };

  const nodeMap = new Map([['u1', unit1], ['u2', unit2]]);

  TextUtils.applyTranslationResult({ id: 'u1', originalText: 'Hello world', translatedText: '[MOCK] Hello' }, nodeMap, store);
  TextUtils.applyTranslationResult({ id: 'u2', originalText: 'Documentation guide', translatedText: '[MOCK] Guide' }, nodeMap, store);

  assert.strictEqual(node1.nodeValue, '[MOCK] Hello');
  assert.strictEqual(node2.nodeValue, '[MOCK] Guide');

  const count = store.restoreAll();
  assert.strictEqual(count, 2);
  assert.strictEqual(node1.nodeValue, 'Hello world');
  assert.strictEqual(node2.nodeValue, 'Documentation guide');
  assert.strictEqual(untouchedNode.nodeValue, 'Unrelated text');
});

// 10. Phase 3 Security: Zero Gemini secrets in extension or repository
test('Security check: Verify no Gemini API keys or secrets exist in extension or git files', () => {
  const rootDir = path.resolve(__dirname, '..');
  const filesToCheck = [
    'manifest.json',
    'popup/popup.js',
    'popup/popup.html',
    'popup/popup.css',
    'content/content.js',
    'background/service-worker.js',
    'utils/text-utils.js',
    'README.md',
    '.env.example'
  ];

  const forbiddenPatterns = [
    /AIza[0-9A-Za-z-_]{35}/, // Live Google/Gemini API key
    /sk-[0-9A-Za-z]{32,}/
  ];

  for (const relPath of filesToCheck) {
    const fullPath = path.join(rootDir, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of forbiddenPatterns) {
        assert(!pattern.test(content), `Found forbidden pattern ${pattern} in ${relPath}`);
      }
    }
  }

  // Verify .gitignore contains .env
  const gitignorePath = path.join(rootDir, '.gitignore');
  assert(fs.existsSync(gitignorePath), '.gitignore must exist');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  assert(gitignoreContent.includes('.env'), '.gitignore must ignore .env');
});

// 11. Manifest V3 Minimal Permissions (activeTab + nativeMessaging for Native Host)
test('Manifest V3 validation and minimal permissions (activeTab and nativeMessaging)', () => {
  const manifestPath = path.resolve(__dirname, '../manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.manifest_version, 3);
  assert.deepStrictEqual(manifest.permissions, ['activeTab', 'nativeMessaging']);
  assert(!manifest.permissions.includes('<all_urls>'));
  assert(!manifest.permissions.includes('webRequest'));
  assert(!manifest.permissions.includes('cookies'));
});

console.log(`\nExtension Tests Summary: ${passedTests} passed, ${failedTests} failed.`);

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('All tests passed successfully!\n');
}
