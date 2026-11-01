/**
 * Roman Urdu Translator — End-to-End Backend Integration Test (Phase 3)
 */

const assert = require('assert');
const { createServer } = require('../server');

async function runIntegrationTest() {
  console.log('\n--- Running Backend Integration Test ---\n');
  const testPort = 3001;
  const server = createServer(testPort);

  try {
    // 1. Health check
    console.log('Testing GET /health ...');
    const healthRes = await fetch(`http://localhost:${testPort}/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok');
    assert.strictEqual(healthData.service, 'roman-urdu-translator-backend');
    console.log('  PASS: GET /health returned 200 OK');

    // 2. Translation batch
    console.log('Testing POST /api/translate ...');
    const batchPayload = {
      operationId: 'op-integration-1',
      batchId: 'batch-integration-1',
      items: [
        { id: 'unit-doc-1', text: 'Overview of the application' },
        { id: 'unit-doc-2', text: 'Installation instructions' }
      ]
    };

    const translateRes = await fetch(`http://localhost:${testPort}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'chrome-extension://test-extension-id'
      },
      body: JSON.stringify(batchPayload)
    });

    assert.strictEqual(translateRes.status, 200);
    assert.strictEqual(translateRes.headers.get('access-control-allow-origin'), 'chrome-extension://test-extension-id');

    const resultData = await translateRes.json();
    assert.strictEqual(resultData.operationId, 'op-integration-1');
    assert.strictEqual(resultData.batchId, 'batch-integration-1');
    assert.strictEqual(resultData.results.length, 2);

    const res1 = resultData.results.find(r => r.id === 'unit-doc-1');
    const res2 = resultData.results.find(r => r.id === 'unit-doc-2');
    assert(res1, 'unit-doc-1 must be present in response');
    assert(res2, 'unit-doc-2 must be present in response');
    assert.strictEqual(res1.originalText, 'Overview of the application');
    assert.strictEqual(res2.originalText, 'Installation instructions');
    console.log('  PASS: POST /api/translate returned valid structured response and preserved IDs');

    // 3. Test Invalid Input Rejection
    console.log('Testing rejection of invalid payload ...');
    const badRes = await fetch(`http://localhost:${testPort}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: 'no-op-id' })
    });
    assert.strictEqual(badRes.status, 400);
    const badData = await badRes.json();
    assert.strictEqual(badData.error.code, 'MISSING_OPERATION_ID');
    console.log('  PASS: Rejected malformed request with 400 and safe error message');

    console.log('\nAll integration tests passed successfully!\n');
  } finally {
    server.close();
  }
}

runIntegrationTest().catch((err) => {
  console.error('Integration test failure:', err);
  process.exit(1);
});
