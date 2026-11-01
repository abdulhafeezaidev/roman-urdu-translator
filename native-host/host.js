/**
 * Roman Urdu Translator — Chrome Native Messaging Host (Phase 6)
 *
 * Supervisor & auto-launcher for local translation backend.
 * Uses Chrome Native Messaging protocol (32-bit length-prefixed JSON on stdin/stdout).
 *
 * Capabilities:
 * - Probes http://127.0.0.1:3000/health
 * - Starts Node.js backend automatically in detached background mode if not running
 * - Prevents duplicate server processes
 * - Provides clean health status and shutdown controls
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PID_FILE = path.join(PROJECT_ROOT, 'backend', '.server.pid');
const DEFAULT_PORT = 3000;
const SERVER_SCRIPT = path.join(PROJECT_ROOT, 'backend', 'server.js');

/**
 * Checks if the backend server is responding on http://127.0.0.1:PORT/health.
 *
 * @param {number} [port=DEFAULT_PORT]
 * @param {number} [timeoutMs=800]
 * @returns {Promise<{ alive: boolean, data?: Object }>}
 */
function probeHealth(port = DEFAULT_PORT, timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/health',
        timeout: timeoutMs
      },
      (res) => {
        if (res.statusCode === 200) {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              resolve({ alive: true, data: parsed });
            } catch (e) {
              resolve({ alive: true });
            }
          });
        } else {
          resolve({ alive: false });
        }
      }
    );

    req.on('error', () => resolve({ alive: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ alive: false });
    });
  });
}

/**
 * Starts the backend server process in detached mode.
 *
 * @returns {number|null} Spawned PID
 */
function spawnBackendProcess() {
  try {
    const child = spawn(process.execPath, [SERVER_SCRIPT], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    return child.pid;
  } catch (err) {
    console.error('[Native Host] Error spawning backend process:', err);
    return null;
  }
}

/**
 * Ensures backend is running: reuses existing instance or starts a new one.
 *
 * @param {number} [maxWaitMs=6000]
 * @returns {Promise<Object>}
 */
async function ensureServerRunning(maxWaitMs = 6000) {
  // 1. Check if already alive
  const initialCheck = await probeHealth();
  if (initialCheck.alive) {
    return {
      success: true,
      status: 'already_running',
      port: DEFAULT_PORT,
      details: initialCheck.data
    };
  }

  // 2. Spawn detached server
  const pid = spawnBackendProcess();
  if (!pid) {
    return {
      success: false,
      error: 'SPAWN_FAILED',
      message: 'Failed to launch background Node.js server process.'
    };
  }

  // 3. Poll /health until responsive or timeout
  const pollIntervalMs = 200;
  const maxAttempts = Math.ceil(maxWaitMs / pollIntervalMs);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const check = await probeHealth();
    if (check.alive) {
      return {
        success: true,
        status: 'started',
        port: DEFAULT_PORT,
        pid,
        details: check.data
      };
    }
  }

  return {
    success: false,
    error: 'STARTUP_TIMEOUT',
    message: `Backend started (PID ${pid}) but did not respond to /health within ${maxWaitMs}ms.`
  };
}

/**
 * Stops the backend process if running.
 *
 * @returns {Promise<Object>}
 */
async function stopServer() {
  let killed = false;
  if (fs.existsSync(PID_FILE)) {
    try {
      const content = fs.readFileSync(PID_FILE, 'utf8');
      const data = JSON.parse(content);
      if (data && data.pid) {
        process.kill(data.pid, 'SIGTERM');
        killed = true;
      }
    } catch (e) {
      // Process may already be dead
    }
    try {
      fs.unlinkSync(PID_FILE);
    } catch (e) {}
  }

  const check = await probeHealth(DEFAULT_PORT, 500);
  return {
    success: true,
    status: check.alive ? 'still_running' : 'stopped',
    killed
  };
}

/**
 * Dispatches an incoming command from Chrome.
 *
 * @param {Object} message
 * @returns {Promise<Object>}
 */
async function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    return { success: false, error: 'INVALID_MESSAGE', message: 'Expected JSON object' };
  }

  switch (message.command) {
    case 'ping':
      return { success: true, pong: true, host: 'com.roman_urdu_translator.host' };

    case 'ensure_server':
      return await ensureServerRunning();

    case 'get_status': {
      const check = await probeHealth();
      return {
        success: true,
        running: check.alive,
        port: DEFAULT_PORT,
        details: check.data || null
      };
    }

    case 'stop_server':
      return await stopServer();

    default:
      return { success: false, error: 'UNKNOWN_COMMAND', command: message.command };
  }
}

/**
 * Native Messaging Protocol Framing (stdin/stdout)
 */
let inputBuffer = Buffer.alloc(0);

function sendNativeResponse(data) {
  const jsonStr = JSON.stringify(data);
  const dataBuf = Buffer.from(jsonStr, 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(dataBuf.length, 0);

  process.stdout.write(Buffer.concat([lenBuf, dataBuf]));
}

function processIncomingBuffer() {
  while (inputBuffer.length >= 4) {
    const msgLength = inputBuffer.readUInt32LE(0);
    const totalLength = 4 + msgLength;

    if (inputBuffer.length < totalLength) {
      // Partial message; wait for more data
      break;
    }

    const jsonChunk = inputBuffer.slice(4, totalLength).toString('utf8');
    inputBuffer = inputBuffer.slice(totalLength);

    try {
      const parsed = JSON.parse(jsonChunk);
      handleMessage(parsed)
        .then((response) => sendNativeResponse(response))
        .catch((err) => sendNativeResponse({ success: false, error: err.message }));
    } catch (err) {
      sendNativeResponse({ success: false, error: 'INVALID_JSON', message: err.message });
    }
  }
}

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  processIncomingBuffer();
});

process.stdin.on('end', () => {
  process.exit(0);
});

module.exports = {
  probeHealth,
  ensureServerRunning,
  stopServer,
  handleMessage
};
