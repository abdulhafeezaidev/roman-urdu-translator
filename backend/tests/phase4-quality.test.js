/**
 * Roman Urdu Translator — Phase 4 Quality & Translation Test Suite
 */

const assert = require('assert');
const { buildSystemInstruction, buildPromptContents, TECHNICAL_TERMS } = require('../prompt-builder');
const { protectText, restoreText, protectBatchItems, restoreBatchResults } = require('../placeholder-utils');
const { checkForbiddenScript, cleanMetaCommentary, validateTranslationOutput } = require('../output-validator');
const { translateWithGemini } = require('../gemini-client');
const { GOLDEN_FIXTURES } = require('../../tests/translation-fixtures');
const { config } = require('../config');

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
  console.log('\n--- Running Phase 4 Translation Quality & Prompt Tests ---\n');

  // 1. Prompt Builder Structure & Rules
  test('Prompt builder includes all required sections and technical terms', () => {
    const sysPrompt = buildSystemInstruction();
    assert(sysPrompt.includes('Pakistani software engineer'), 'Must establish Pakistani engineer persona');
    assert(sysPrompt.includes('Latin/English alphabet'), 'Must specify Latin script only');
    assert(sysPrompt.includes('FORBIDDEN: NEVER output Arabic/Urdu script'), 'Must forbid Arabic/Urdu script');
    assert(sysPrompt.includes('NO HINDI/HINGLISH'), 'Must forbid Hindi/Hinglish idioms');
    assert(sysPrompt.includes('__PROT_'), 'Must include placeholder rules');

    for (const term of ['API', 'SDK', 'framework', 'service worker', 'DOM', 'database', 'request']) {
      assert(TECHNICAL_TERMS.includes(term), `Technical terms list must include ${term}`);
    }

    const items = [{ id: 'u1', text: 'Hello' }];
    const contents = buildPromptContents(items);
    assert.strictEqual(contents.length, 1);
    assert(contents[0].parts[0].text.includes('BATCH INPUT TO TRANSLATE'));
  });

  // 2. Placeholder Engine: Code & Command Protection
  test('Placeholder engine replaces URLs, CLI commands, paths, and inline code', () => {
    const raw = 'Run npm install express and clone https://github.com/example/repo.git from /api/v1/auth to test `getUser()`.';
    const protectedRes = protectText(raw);

    assert(!protectedRes.text.includes('npm install express'), 'Command must be replaced by placeholder');
    assert(!protectedRes.text.includes('https://github.com/example/repo.git'), 'URL must be replaced');
    assert(!protectedRes.text.includes('`getUser()`'), 'Inline code must be replaced');
    assert(protectedRes.placeholders.size >= 3, 'Must capture all protected elements');

    // Restoration
    const restored = restoreText(protectedRes.text, protectedRes.placeholders);
    assert.strictEqual(restored, raw, 'Restored text must match original exactly');
  });

  // 3. Placeholder Engine: Batch Processing
  test('protectBatchItems and restoreBatchResults operate accurately across multiple items', () => {
    const items = [
      { id: 'item-1', text: 'Visit https://example.com/docs for guidance.' },
      { id: 'item-2', text: 'Execute npm run dev in terminal.' },
      { id: 'item-3', text: 'Plain text with no code elements.' }
    ];

    const { protectedItems, batchPlaceholders } = protectBatchItems(items);
    assert.strictEqual(protectedItems.length, 3);
    assert(protectedItems[0].text.includes('__PROT_0__'));
    assert(protectedItems[1].text.includes('__PROT_1__'));
    assert.strictEqual(protectedItems[2].text, 'Plain text with no code elements.');

    // Simulated translated response preserving placeholders
    const translatedResults = [
      { id: 'item-1', translatedText: 'Guidance ke liye __PROT_0__ visit karein.' },
      { id: 'item-2', translatedText: 'Terminal mein __PROT_1__ execute karein.' },
      { id: 'item-3', translatedText: 'Baghair code wala plain text.' }
    ];

    const restoredResults = restoreBatchResults(translatedResults, batchPlaceholders);
    assert(restoredResults[0].translatedText.includes('https://example.com/docs'));
    assert(restoredResults[1].translatedText.includes('npm run dev'));
    assert.strictEqual(restoredResults[2].translatedText, 'Baghair code wala plain text.');
  });

  // 4. Output Validator: Script Detection
  test('Output validator detects and rejects Urdu/Arabic and Devanagari scripts', () => {
    assert.strictEqual(checkForbiddenScript('Yeh bilkul theek Roman Urdu hai.').hasForbiddenScript, false);

    // Urdu script
    const urduCheck = checkForbiddenScript('یہ اردو سکرپٹ ہے');
    assert.strictEqual(urduCheck.hasForbiddenScript, true);
    assert.strictEqual(urduCheck.scriptType, 'Urdu/Arabic');

    // Devanagari script
    const hindiCheck = checkForbiddenScript('यह देवनागरी लिपि है');
    assert.strictEqual(hindiCheck.hasForbiddenScript, true);
    assert.strictEqual(hindiCheck.scriptType, 'Devanagari/Hindi');
  });

  // 5. Output Validator: Meta-Commentary Cleaner
  test('Output validator cleans model meta-commentary prefixes', () => {
    assert.strictEqual(
      cleanMetaCommentary('Here is the translation: API key create karein.'),
      'API key create karein.'
    );
    assert.strictEqual(
      cleanMetaCommentary('Translation: Server response ka wait karein.'),
      'Server response ka wait karein.'
    );
    assert.strictEqual(
      cleanMetaCommentary('Sure! Here is the translation: Browser request send karta hai.'),
      'Browser request send karta hai.'
    );
  });

  // 6. Output Validator: Comprehensive Batch Validation
  test('validateTranslationOutput validates 1:1 ID matching and rejects invalid payloads', () => {
    const expectedItems = [
      { id: 'u1', text: 'Text 1' },
      { id: 'u2', text: 'Text 2' }
    ];

    // Valid
    const validRaw = [
      { id: 'u1', translatedText: 'Translation 1' },
      { id: 'u2', translatedText: 'Translation 2' }
    ];
    assert.strictEqual(validateTranslationOutput(expectedItems, validRaw).valid, true);

    // Missing ID
    const missingRaw = [{ id: 'u1', translatedText: 'Translation 1' }];
    const missingRes = validateTranslationOutput(expectedItems, missingRaw);
    assert.strictEqual(missingRes.valid, false);
    assert.strictEqual(missingRes.code, 'MISSING_REQUESTED_ID');

    // Unexpected extra ID
    const extraRaw = [
      { id: 'u1', translatedText: 'Translation 1' },
      { id: 'u2', translatedText: 'Translation 2' },
      { id: 'extra', translatedText: 'Extra' }
    ];
    assert.strictEqual(validateTranslationOutput(expectedItems, extraRaw).code, 'UNEXPECTED_RESULT_ID');

    // Duplicate ID
    const dupRaw = [
      { id: 'u1', translatedText: 'Translation 1' },
      { id: 'u1', translatedText: 'Duplicate' }
    ];
    assert.strictEqual(validateTranslationOutput(expectedItems, dupRaw).code, 'DUPLICATE_RESULT_ID');

    // Forbidden script
    const scriptRaw = [
      { id: 'u1', translatedText: 'یہ غلط ہے' },
      { id: 'u2', translatedText: 'Valid Roman Urdu' }
    ];
    assert.strictEqual(validateTranslationOutput(expectedItems, scriptRaw).code, 'FORBIDDEN_SCRIPT_DETECTED');
  });

  // 7. Golden Dataset Validation
  test('Golden dataset contains 50+ representative test fixtures across required categories', () => {
    assert(GOLDEN_FIXTURES.length >= 50, `Expected at least 50 fixtures, found ${GOLDEN_FIXTURES.length}`);
    const categories = new Set(GOLDEN_FIXTURES.map(f => f.category));
    assert(categories.size >= 10, 'Expected diverse categorization');
    for (const fixture of GOLDEN_FIXTURES) {
      assert(fixture.id, 'Fixture must have id');
      assert(fixture.english, 'Fixture must have english text');
      assert(fixture.category, 'Fixture must have category');
    }
  });

  // 8. Live Gemini Translation Quality Test with Real API Call
  await testAsync('Live Gemini 2.5 Flash translation test on technical documentation batch', async () => {
    if (!config.geminiApiKey) {
      console.log('  SKIP: GEMINI_API_KEY not found; skipping live call.');
      return;
    }

    const testBatch = {
      operationId: 'op-quality-live-1',
      batchId: 'batch-quality-live-1',
      items: [
        { id: 'live-1', text: 'Before using the API, you need to create an API key.' },
        { id: 'live-2', text: 'A service worker is an event-driven worker registered in the browser.' },
        { id: 'live-3', text: 'Run npm install express to install the required package.' }
      ]
    };

    console.log('Sending live batch translation to Gemini 2.5 Flash...');
    const result = await translateWithGemini(testBatch);

    assert.strictEqual(result.operationId, 'op-quality-live-1');
    assert.strictEqual(result.results.length, 3);

    const r1 = result.results.find(r => r.id === 'live-1');
    const r2 = result.results.find(r => r.id === 'live-2');
    const r3 = result.results.find(r => r.id === 'live-3');

    console.log('Live Translation Results:');
    console.log('  1. English:    ', r1.originalText);
    console.log('     Roman Urdu: ', r1.translatedText);
    console.log('  2. English:    ', r2.originalText);
    console.log('     Roman Urdu: ', r2.translatedText);
    console.log('  3. English:    ', r3.originalText);
    console.log('     Roman Urdu: ', r3.translatedText);

    // Verify Latin script only (no Arabic/Urdu or Devanagari)
    assert(!checkForbiddenScript(r1.translatedText).hasForbiddenScript, 'Must not contain forbidden script');
    assert(!checkForbiddenScript(r2.translatedText).hasForbiddenScript, 'Must not contain forbidden script');
    assert(!checkForbiddenScript(r3.translatedText).hasForbiddenScript, 'Must not contain forbidden script');

    // Verify technical terms preserved
    assert(r1.translatedText.toLowerCase().includes('api'), 'Item 1 must preserve "API"');
    assert(r2.translatedText.toLowerCase().includes('service worker'), 'Item 2 must preserve "service worker"');
    assert(r2.translatedText.toLowerCase().includes('browser'), 'Item 2 must preserve "browser"');

    // Verify CLI command preserved exactly
    assert(r3.translatedText.includes('npm install express'), 'Item 3 must preserve exact command "npm install express"');
  });

  console.log(`\nPhase 4 Quality Tests: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
