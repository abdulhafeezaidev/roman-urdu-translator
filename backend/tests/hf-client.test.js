/**
 * Roman Urdu Translator — Hugging Face Client Unit Tests
 */

'use strict';

const assert = require('assert');
const { buildUserPrompt, normalizeHfResponse } = require('../hf-client');

function runTests() {
  console.log('\n--- Running Hugging Face Client Unit Tests ---\n');

  // Test 1: User prompt construction
  console.log('Testing buildUserPrompt structure...');
  const items = [
    { id: 'u1', text: 'Click the button below to deploy.' },
    { id: 'u2', text: 'Check the documentation.' }
  ];
  const prompt = buildUserPrompt(items);
  assert(prompt.includes('conversational Pakistani Roman Urdu'));
  assert(prompt.includes('u1'));
  assert(prompt.includes('Click the button below to deploy.'));
  console.log('  PASS: User prompt correctly embeds items and instructions');

  // Test 2: Response normalization
  console.log('Testing normalizeHfResponse contract adherence...');
  const batch = {
    operationId: 'op-123',
    batchId: 'b-456',
    items
  };
  const results = [
    { id: 'u1', translatedText: 'Deploy karne ke liye neeche diye gaye button par click karein.' },
    { id: 'u2', translatedText: 'Documentation check karein.' }
  ];
  const normalized = normalizeHfResponse(batch, results);
  assert.strictEqual(normalized.operationId, 'op-123');
  assert.strictEqual(normalized.batchId, 'b-456');
  assert.strictEqual(normalized.results.length, 2);
  assert.strictEqual(normalized.results[0].id, 'u1');
  assert.strictEqual(normalized.results[0].originalText, 'Click the button below to deploy.');
  assert.strictEqual(normalized.results[0].translatedText, 'Deploy karne ke liye neeche diye gaye button par click karein.');
  console.log('  PASS: Response normalization strictly adheres to translation contract');

  console.log('\nHugging Face Client Tests: All passed successfully!\n');
}

runTests();
