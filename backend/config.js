/**
 * Roman Urdu Translator — Backend Configuration (Phase 3 Verified)
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envCandidates = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env')
  ];

  // Upward traversal from __dirname
  let curr = __dirname;
  for (let i = 0; i < 5; i++) {
    const parent = path.dirname(curr);
    if (!parent || parent === curr) break;
    envCandidates.push(path.join(parent, '.env'));
    curr = parent;
  }

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
        if (process.env.GEMINI_API_KEY || process.env.HF_API_KEY) {
          break; // Successfully loaded API key
        }
      } catch (e) {
        // Ignore reading errors
      }
    }
  }
}

loadEnvFile();

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  provider: process.env.TRANSLATION_PROVIDER || 'all',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  hfApiKey: process.env.HF_API_KEY || '',
  hfModel: process.env.HF_MODEL || 'meta-llama/Llama-3.3-70B-Instruct',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  allowedExtensionId: process.env.ALLOWED_EXTENSION_ID || '',
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 30000,
  // Aligned with Phase 8 client target (50 items / 6,500 chars) + headroom for normalization
  maxBatchItems: parseInt(process.env.MAX_BATCH_ITEMS, 10) || 50,
  maxBatchCharacters: parseInt(process.env.MAX_BATCH_CHARACTERS, 10) || 8000,
  maxBodySizeBytes: 1024 * 1024, // 1MB payload ceiling
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
};

/**
 * Validates if an incoming request Origin is allowed.
 *
 * @param {string|undefined} origin
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
  if (!origin || (!isProduction && origin === 'null')) {
    return true; // Direct non-browser, file://, or curl/test invocations
  }

  // If a specific extension ID is configured, enforce exact match
  if (config.allowedExtensionId) {
    const expectedOrigin = `chrome-extension://${config.allowedExtensionId}`;
    if (origin === expectedOrigin) {
      return true;
    }
  } else if (!isProduction && origin.startsWith('chrome-extension://')) {
    // In local development, permit extension origins while warning
    return true;
  }

  // Allow local development servers
  if (!isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }

  // Explicitly configured origins
  if (config.allowedOrigins.includes(origin)) {
    return true;
  }

  return false;
}

module.exports = {
  config,
  isOriginAllowed
};
