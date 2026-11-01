/**
 * Roman Urdu Translator — Secure Translation Proxy Server (Phase 3)
 *
 * Lightweight Node.js HTTP server.
 * Zero external dependencies.
 * Provides:
 * - CORS with origin validation (allowing extension and development origins)
 * - Strict payload size and schema validation
 * - Communication with Google Gemini via gemini-client.js
 * - Stripped and sanitized error responses
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { config, isOriginAllowed } = require('./config');
const { validateBatchRequest } = require('./validator');
const { translateWithGemini } = require('./gemini-client');
const { translateWithHf } = require('./hf-client');
const { translateWithGroq } = require('./groq-client');
const { translateWithProviderPool, getActiveProviderPool } = require('./provider-pool');

const SETTINGS_FILE = path.join(__dirname, '.settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { autoTranslate: false };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Sends a sanitized JSON response.
 *
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {Object} data
 * @param {string|undefined} origin
 */
function sendJson(res, statusCode, data, origin) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff'
  };

  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

/**
 * Sends a sanitized error response.
 *
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {string} code
 * @param {string} message
 * @param {string|undefined} origin
 */
function sendError(res, statusCode, code, message, origin) {
  sendJson(res, statusCode, {
    error: {
      code: code || 'INTERNAL_ERROR',
      message: message || 'An error occurred while processing the request.'
    }
  }, origin);
}

/**
 * Handles incoming HTTP requests.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function handleRequest(req, res) {
  const origin = req.headers.origin;
  const startTime = Date.now();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    if (origin && !isOriginAllowed(origin)) {
      res.writeHead(403);
      return res.end();
    }
    const preflightHeaders = {
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };
    if (origin) {
      preflightHeaders['Access-Control-Allow-Origin'] = origin;
    }
    res.writeHead(204, preflightHeaders);
    return res.end();
  }

  // Route: GET /health
  if (req.method === 'GET' && req.url === '/health') {
    const activePool = getActiveProviderPool();
    let model = config.geminiModel;
    let hasApiKey = Boolean(config.geminiApiKey);
    if (config.provider === 'huggingface') {
      model = config.hfModel;
      hasApiKey = Boolean(config.hfApiKey);
    } else if (config.provider === 'groq') {
      model = config.groqModel;
      hasApiKey = Boolean(config.groqApiKey);
    } else if (config.provider === 'all' || config.provider === 'pool') {
      model = `Multi-Provider Pool [${activePool.join(', ')}]`;
      hasApiKey = activePool.length > 0;
    }
    return sendJson(res, 200, {
      status: 'ok',
      service: 'roman-urdu-translator-backend',
      provider: config.provider,
      activePool,
      model,
      hasApiKey,
      timestamp: new Date().toISOString()
    }, origin);
  }

  // Route: GET /api/settings
  if (req.method === 'GET' && req.url === '/api/settings') {
    return sendJson(res, 200, { success: true, settings: loadSettings() }, origin);
  }

  // Route: POST /api/settings
  if (req.method === 'POST' && req.url === '/api/settings') {
    if (origin && !isOriginAllowed(origin)) {
      return sendError(res, 403, 'FORBIDDEN_ORIGIN', 'Origin is not permitted.', origin);
    }
    let bodyRaw = '';
    req.on('data', (chunk) => { bodyRaw += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(bodyRaw);
        const current = loadSettings();
        if (typeof payload.autoTranslate === 'boolean') {
          current.autoTranslate = payload.autoTranslate;
        }
        saveSettings(current);
        console.log('[INFO] Settings updated:', JSON.stringify(current));
        return sendJson(res, 200, { success: true, settings: current }, origin);
      } catch (err) {
        return sendError(res, 400, 'INVALID_SETTINGS', 'Malformed settings JSON payload.', origin);
      }
    });
    return;
  }

  // Route: POST /api/translate
  if (req.method === 'POST' && req.url === '/api/translate') {
    if (origin && !isOriginAllowed(origin)) {
      return sendError(res, 403, 'FORBIDDEN_ORIGIN', 'Origin is not permitted.', origin);
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.', origin);
    }

    let bodyRaw = '';
    let bodySize = 0;

    req.on('data', (chunk) => {
      bodySize += chunk.length;
      if (bodySize > config.maxBodySizeBytes) {
        req.destroy(); // Abort oversized stream immediately
      } else {
        bodyRaw += chunk;
      }
    });

    req.on('end', async () => {
      if (bodySize > config.maxBodySizeBytes) {
        return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds size limit (1MB).', origin);
      }

      let parsedBody;
      try {
        parsedBody = JSON.parse(bodyRaw);
      } catch (err) {
        return sendError(res, 400, 'MALFORMED_JSON', 'Request body contains invalid JSON.', origin);
      }

      // Validate payload against schema and limits
      const validation = validateBatchRequest(parsedBody);
      if (!validation.valid) {
        return sendError(res, 400, validation.code, validation.error, origin);
      }

      try {
        let result;
        const isPoolMode = config.provider === 'all' || config.provider === 'pool' || config.provider === 'multi' || config.provider.includes(',');
        if (isPoolMode) {
          result = await translateWithProviderPool(parsedBody);
        } else if (config.provider === 'groq') {
          result = await translateWithGroq(parsedBody);
        } else if (config.provider === 'huggingface') {
          result = await translateWithHf(parsedBody);
        } else {
          result = await translateWithGemini(parsedBody);
        }
        const duration = Date.now() - startTime;
        const providerTag = result.providerUsed ? ` [${result.providerUsed}]` : '';
        console.log(
          `[INFO] POST /api/translate - Batch: ${parsedBody.batchId}, ` +
          `Items: ${parsedBody.items.length}, Duration: ${duration}ms, Provider:${providerTag} Mock: ${Boolean(result.isMock)}`
        );
        return sendJson(res, 200, result, origin);
      } catch (err) {
        const duration = Date.now() - startTime;
        console.error(`[ERROR] Translation failed for batch ${parsedBody.batchId} (${duration}ms):`, err.message || err);
        const statusCode = err.status && typeof err.status === 'number' ? err.status : 500;
        const errCode = err.code || 'TRANSLATION_ERROR';
        const errMessage = err.message || 'Translation service encountered an error.';
        return sendError(res, statusCode, errCode, errMessage, origin);
      }
    });

    return;
  }

  // Route not found
  sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.url} does not exist.`, origin);
}

const PID_FILE = path.join(__dirname, '.server.pid');

/**
 * Creates and starts the HTTP server on IPv4 localhost (127.0.0.1).
 *
 * @param {number} [port]
 * @param {string} [host]
 * @returns {http.Server}
 */
function createServer(port = config.port, host = '127.0.0.1') {
  const server = http.createServer(handleRequest);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Roman Urdu Translator Backend] Port ${port} is already in use.`);
    } else {
      console.error('[Roman Urdu Translator Backend] Server error:', err);
    }
  });

  server.listen(port, host, () => {
    console.log(`[Roman Urdu Translator Backend] Server listening on http://${host}:${port}`);
    // Record PID if running on default port or as main process
    try {
      fs.writeFileSync(PID_FILE, JSON.stringify({
        pid: process.pid,
        port,
        host,
        startTime: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      // Ignore write errors in restricted environments
    }
  });

  return server;
}

function cleanPidFile() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const content = fs.readFileSync(PID_FILE, 'utf8');
      const data = JSON.parse(content);
      if (data && data.pid === process.pid) {
        fs.unlinkSync(PID_FILE);
      }
    }
  } catch (e) {}
}

// Start server if executed directly
if (require.main === module) {
  // Check if another instance is already running
  if (fs.existsSync(PID_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
      if (existing && existing.pid) {
        let isRunning = false;
        try {
          process.kill(existing.pid, 0);
          isRunning = true;
        } catch (e) {}

        if (isRunning) {
          console.log(`[Roman Urdu Translator Backend] Instance already running on PID ${existing.pid} (port ${existing.port || config.port}). Exiting duplicate.`);
          process.exit(0);
        }
      }
    } catch (e) {}
  }

  process.on('exit', cleanPidFile);
  process.on('SIGINT', () => { cleanPidFile(); process.exit(0); });
  process.on('SIGTERM', () => { cleanPidFile(); process.exit(0); });

  createServer();
}

module.exports = {
  createServer,
  handleRequest,
  cleanPidFile,
  PID_FILE
};

