/**
 * Roman Urdu Translator — Backend Automated Tests (Phase 3)
 */

const assert = require('assert');
const { validateBatchRequest } = require('../validator');
const { buildGeminiPayload, normalizeGeminiResponse, translateWithGemini } = require('../gemini-client');
const { isOriginAllowed, config } = require('../config');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err.stack || err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
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
  console.log('\n--- Running Backend Phase 3 Test Suite ---\n');

  // 1. Valid Request Validation
  test('Valid batch request passes validation', () => {
    const valid = {
      operationId: 'op-valid-1',
      batchId: 'batch-valid-1',
      items: [
        { id: 'unit-1', text: 'Hello world' },
        { id: 'unit-2', text: 'Developer documentation' }
      ]
    };
    const res = validateBatchRequest(valid);
    assert.strictEqual(res.valid, true);
  });

  // 2. Missing operationId
  test('Missing or empty operationId is rejected', () => {
    const req = { batchId: 'batch-1', items: [{ id: 'u1', text: 'text' }] };
    const res = validateBatchRequest(req);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'MISSING_OPERATION_ID');
  });

  // 3. Missing batchId
  test('Missing or empty batchId is rejected', () => {
    const req = { operationId: 'op-1', items: [{ id: 'u1', text: 'text' }] };
    const res = validateBatchRequest(req);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'MISSING_BATCH_ID');
  });

  // 4. Missing or Empty Items
  test('Missing items array is rejected', () => {
    const req = { operationId: 'op-1', batchId: 'batch-1' };
    const res = validateBatchRequest(req);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'MISSING_ITEMS');
  });

  test('Empty items array is rejected', () => {
    const req = { operationId: 'op-1', batchId: 'batch-1', items: [] };
    const res = validateBatchRequest(req);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'EMPTY_BATCH');
  });

  // 5. Malformed Item
  test('Malformed item without id or text is rejected', () => {
    const reqNoId = {
      operationId: 'op-1',
      batchId: 'batch-1',
      items: [{ text: 'No id' }]
    };
    assert.strictEqual(validateBatchRequest(reqNoId).code, 'INVALID_ITEM_ID');

    const reqNoText = {
      operationId: 'op-1',
      batchId: 'batch-1',
      items: [{ id: 'u1', text: 123 }]
    };
    assert.strictEqual(validateBatchRequest(reqNoText).code, 'INVALID_ITEM_TEXT');
  });

  // 6. Duplicate Item IDs in Same Batch
  test('Duplicate item IDs within batch are rejected', () => {
    const req = {
      operationId: 'op-1',
      batchId: 'batch-1',
      items: [
        { id: 'dup-id', text: 'First' },
        { id: 'dup-id', text: 'Second' }
      ]
    };
    const res = validateBatchRequest(req);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'DUPLICATE_ITEM_ID');
  });

  // 7. Oversized Batch Items
  test('Exceeding maximum items per batch is rejected', () => {
    const items = [];
    const oversizedCount = (config.maxBatchItems || 50) + 10;
    for (let i = 0; i < oversizedCount; i++) {
      items.push({ id: `item-${i}`, text: 'text' });
    }
    const req = { operationId: 'op-1', batchId: 'batch-1', items };
    const res = validateBatchRequest(req);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'BATCH_TOO_LARGE');
  });

  // 8. Oversized Character Volume
  test('Exceeding total batch characters is rejected', () => {
    const req = {
      operationId: 'op-1',
      batchId: 'batch-1',
      items: [{ id: 'u1', text: 'A'.repeat(12000) }]
    };
    const res = validateBatchRequest(req);
    assert.strictEqual(res.valid, false);
    assert(res.code === 'ITEM_TEXT_TOO_LARGE' || res.code === 'BATCH_CHARACTERS_EXCEEDED');
  });

  // 9. Gemini Payload Schema
  test('buildGeminiPayload configures structured JSON schema and modular prompt', () => {
    const items = [{ id: 'u1', text: 'Hello' }];
    const payload = buildGeminiPayload(items);
    assert(payload.contents[0].parts[0].text.includes('BATCH INPUT TO TRANSLATE'));
    assert(payload.system_instruction && payload.system_instruction.parts[0].text.includes('ROLE & CORE OBJECTIVE'));
    assert.strictEqual(payload.generationConfig.responseMimeType, 'application/json');
    assert.strictEqual(payload.generationConfig.responseSchema.type, 'ARRAY');
  });

  // 10. Gemini Response Normalization
  test('normalizeGeminiResponse correctly maps validated results into internal contract', () => {
    const batch = {
      operationId: 'op-test',
      batchId: 'b-1',
      items: [
        { id: 'u1', text: 'First' },
        { id: 'u2', text: 'Second' }
      ]
    };

    const validatedResults = [
      { id: 'u2', translatedText: '[TRANS] Second' },
      { id: 'u1', translatedText: '[TRANS] First' }
    ];

    const normalized = normalizeGeminiResponse(batch, validatedResults);
    assert.strictEqual(normalized.operationId, 'op-test');
    assert.strictEqual(normalized.batchId, 'b-1');

    const byId = new Map(normalized.results.map(r => [r.id, r]));
    assert.strictEqual(byId.get('u1').translatedText, '[TRANS] First');
    assert.strictEqual(byId.get('u1').originalText, 'First');
    assert.strictEqual(byId.get('u2').translatedText, '[TRANS] Second');
    assert.strictEqual(byId.get('u2').originalText, 'Second');
  });

  // 11. Mock Translation Execution
  await testAsync('translateWithGemini operates in mock mode when key is absent', async () => {
    const batch = {
      operationId: 'op-mock',
      batchId: 'batch-mock-1',
      items: [{ id: 'u1', text: 'Documentation' }]
    };

    const res = await translateWithGemini(batch, { forceMock: true });
    assert.strictEqual(res.operationId, 'op-mock');
    assert.strictEqual(res.batchId, 'batch-mock-1');
    assert.strictEqual(res.results.length, 1);
    assert.strictEqual(res.results[0].translatedText, '[TEST MOCK] Documentation');
    assert.strictEqual(res.isMock, true);
  });

  // 12. CORS Origin Allowed Function
  test('isOriginAllowed permits Chrome extension and localhost origins', () => {
    assert.strictEqual(isOriginAllowed('chrome-extension://abcdefghijklmnop'), true);
    assert.strictEqual(isOriginAllowed('http://localhost:3000'), true);
    assert.strictEqual(isOriginAllowed('http://127.0.0.1:8080'), true);
    assert.strictEqual(isOriginAllowed(undefined), true); // direct server calls
    assert.strictEqual(isOriginAllowed('https://malicious-external-website.com'), false);
  });

  console.log(`\nBackend Tests: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
