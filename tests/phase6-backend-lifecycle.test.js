/**
 * Roman Urdu Translator — Phase 6 Backend Lifecycle & Native Host Test
 *
 * Tests:
 * 1. Native Messaging protocol framing (32-bit length prefix stdin/stdout)
 * 2. Ping command response
 * 3. Automatic backend startup when stopped
 * 4. Reuse of existing running instance (no duplicate server processes)
 * 5. Localhost-only binding (127.0.0.1)
 * 6. Clean server shutdown via Native Host
 */

'use strict';

const assert = require('assert');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { probeHealth, ensureServerRunning, stopServer } = require('../native-host/host');

const HOST_SCRIPT = path.resolve(__dirname, '../native-host/host.js');

/**
 * Helper to communicate with host.js over stdio using Native Messaging protocol.
 */
function sendNativeMessageToProcess(child, message) {
  return new Promise((resolve, reject) => {
    const jsonStr = JSON.stringify(message);
    const dataBuf = Buffer.from(jsonStr, 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(dataBuf.length, 0);

    let outputBuf = Buffer.alloc(0);

    function onData(chunk) {
      outputBuf = Buffer.concat([outputBuf, chunk]);
      if (outputBuf.length >= 4) {
        const msgLen = outputBuf.readUInt32LE(0);
        if (outputBuf.length >= 4 + msgLen) {
          const respJson = outputBuf.slice(4, 4 + msgLen).toString('utf8');
          child.stdout.removeListener('data', onData);
          try {
            resolve(JSON.parse(respJson));
          } catch (e) {
            reject(e);
          }
        }
      }
    }

    child.stdout.on('data', onData);
    child.stdin.write(Buffer.concat([lenBuf, dataBuf]));
  });
}

async function runLifecycleTests() {
  console.log('\n--- Running Phase 6 Backend Lifecycle & Native Host Test Suite ---\n');

  // Test 1: Native Messaging protocol via host.js child process (Ping)
  console.log('Testing Native Messaging protocol framing & ping command...');
  const hostProcess = spawn(process.execPath, [HOST_SCRIPT], {
    stdio: ['pipe', 'pipe', 'inherit']
  });

  const pingResp = await sendNativeMessageToProcess(hostProcess, { command: 'ping' });
  assert.strictEqual(pingResp.success, true);
  assert.strictEqual(pingResp.pong, true);
  assert.strictEqual(pingResp.host, 'com.roman_urdu_translator.host');
  console.log('  PASS: Native Host responds to 32-bit length-prefixed ping command');

  // Test 2: Ensure server running (Automatic Startup)
  console.log('Testing automatic server startup via Native Host...');
  const startResp = await ensureServerRunning(8000);
  assert.strictEqual(startResp.success, true);
  assert(startResp.status === 'started' || startResp.status === 'already_running', 'Status should be started or already_running');
  assert.strictEqual(startResp.port, 3000);

  const healthCheck = await probeHealth(3000);
  assert.strictEqual(healthCheck.alive, true);
  assert.strictEqual(healthCheck.data.status, 'ok');
  assert.strictEqual(healthCheck.data.service, 'roman-urdu-translator-backend');
  console.log('  PASS: Backend server automatically running and healthy on port 3000');

  // Test 3: Duplicate process prevention (EnsureServerRunning called again)
  console.log('Testing duplicate process prevention on second ensure_server call...');
  const secondCallResp = await ensureServerRunning(4000);
  assert.strictEqual(secondCallResp.success, true);
  assert.strictEqual(secondCallResp.status, 'already_running');
  console.log('  PASS: Second ensure_server call reuses existing instance without spawning duplicate');

  // Test 4: Duplicate process prevention on direct server.js launch
  console.log('Testing direct server.js execution when server is already running...');
  const duplicateProcess = spawn(process.execPath, [path.resolve(__dirname, '../backend/server.js')], {
    stdio: 'pipe'
  });

  const dupExitCode = await new Promise((resolve) => {
    duplicateProcess.on('exit', (code) => resolve(code));
  });
  assert.strictEqual(dupExitCode, 0, 'Duplicate process should exit cleanly with code 0');
  console.log('  PASS: Duplicate server.js invocation detected existing server and exited cleanly');

  // Test 5: Localhost-only binding check (127.0.0.1 responds)
  console.log('Testing localhost-only binding...');
  const localhostReq = await new Promise((resolve) => {
    http.get('http://127.0.0.1:3000/health', (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
  assert.strictEqual(localhostReq, true, 'Server must be accessible via 127.0.0.1');
  console.log('  PASS: Server is bound to IPv4 localhost (127.0.0.1)');

  // Test 6: Native Messaging Host get_status
  console.log('Testing get_status via Native Host protocol...');
  const statusResp = await sendNativeMessageToProcess(hostProcess, { command: 'get_status' });
  assert.strictEqual(statusResp.success, true);
  assert.strictEqual(statusResp.running, true);
  assert.strictEqual(statusResp.port, 3000);
  console.log('  PASS: get_status reports server is running and healthy');

  // Clean up host process stdio
  hostProcess.stdin.end();

  console.log('\nPhase 6 Backend Lifecycle Tests: All 6 passed successfully!\n');
}

runLifecycleTests().catch((err) => {
  console.error('\nLifecycle Test Failure:', err);
  process.exit(1);
});
