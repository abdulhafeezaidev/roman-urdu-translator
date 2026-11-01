/**
 * Roman Urdu Translator — Gemini Client Proxy (Phase 4 Quality Engine)
 *
 * Implements:
 * - Pre-translation placeholder protection for code, URLs, commands, and identifiers
 * - Modular Pakistani Roman Urdu system instruction from prompt-builder.js
 * - Structured JSON output enforcement (responseSchema)
 * - Server-side authentication (API key never exposed to client)
 * - Strict output validation (output-validator.js)
 * - Post-translation placeholder restoration
 * - Bounded exponential backoff retries for transient errors (429, 503)
 */

const { config } = require('./config');
const { buildPromptContents, buildSystemInstruction } = require('./prompt-builder');
const { protectBatchItems, restoreBatchResults } = require('./placeholder-utils');
const { validateTranslationOutput } = require('./output-validator');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the structured generation payload for the Gemini API.
 *
 * @param {Array<{id: string, text: string}>} items
 * @returns {Object}
 */
function buildGeminiPayload(items) {
  return {
    system_instruction: {
      parts: [
        { text: buildSystemInstruction() }
      ]
    },
    contents: buildPromptContents(items),
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        description: 'List of translated text units matching input IDs.',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', description: 'The exact matching ID of the input text unit.' },
            translatedText: { type: 'STRING', description: 'The natural Pakistani Roman Urdu translated text.' }
          },
          required: ['id', 'translatedText']
        }
      }
    }
  };
}

/**
 * Normalizes validated model output into our internal translation contract.
 *
 * @param {Object} batch
 * @param {Array<{id: string, translatedText: string}>} validatedResults
 * @returns {Object}
 */
function normalizeGeminiResponse(batch, validatedResults) {
  const originalTextMap = new Map();
  for (const item of batch.items) {
    originalTextMap.set(item.id, item.text);
  }

  const results = validatedResults.map((res) => ({
    id: res.id,
    originalText: originalTextMap.get(res.id) || '',
    translatedText: res.translatedText
  }));

  return {
    operationId: batch.operationId,
    batchId: batch.batchId,
    results
  };
}

/**
 * Executes a translation batch via Google Gemini API with Phase 4 quality enforcement.
 *
 * @param {Object} batch - Validated batch object
 * @param {Object} [options]
 * @param {boolean} [options.forceMock=false]
 * @returns {Promise<Object>}
 */
async function translateWithGemini(batch, options = {}) {
  // Mock mode is ONLY allowed for automated tests, NEVER as a silent production fallback
  if (options.forceMock || (process.env.NODE_ENV === 'test' && !config.geminiApiKey)) {
    return {
      operationId: batch.operationId,
      batchId: batch.batchId,
      results: batch.items.map((item) => ({
        id: item.id,
        originalText: item.text,
        translatedText: `[TEST MOCK] ${item.text}`
      })),
      isMock: true
    };
  }

  if (!config.geminiApiKey) {
    throw {
      status: 500,
      code: 'MISSING_API_KEY',
      message: 'Gemini API key is not configured on the backend server. Please set GEMINI_API_KEY in .env.'
    };
  }

  // 1. Pre-translation: Protect code, URLs, commands, and technical identifiers
  const { protectedItems, batchPlaceholders } = protectBatchItems(batch.items);

  // 2. Build structured request with modular Pakistani Roman Urdu prompt
  const primaryModel = config.geminiModel || 'gemini-2.5-flash';
  const fallbackModel = 'gemini-2.5-flash';
  let activeModel = primaryModel;

  const payload = buildGeminiPayload(protectedItems);
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.geminiApiKey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const candidate = data.candidates && data.candidates[0];
        const part = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0];
        const textContent = part && part.text;

        if (!textContent) {
          throw new Error('MALFORMED_GEMINI_RESPONSE: Empty response candidate from Gemini.');
        }

        let parsedJson;
        try {
          parsedJson = JSON.parse(textContent);
        } catch (parseErr) {
          throw new Error('MALFORMED_GEMINI_RESPONSE: Output is not valid JSON.');
        }

        // 3. Quality Validation: Verify IDs, check forbidden scripts, clean meta-commentary
        const validation = validateTranslationOutput(batch.items, parsedJson);
        if (!validation.valid) {
          throw {
            status: 502,
            code: validation.code || 'TRANSLATION_QUALITY_ERROR',
            message: `Translation rejected by quality validation: ${validation.error}`
          };
        }

        // 4. Post-translation: Restore protected code, URLs, and commands exactly
        const restoredResults = restoreBatchResults(validation.sanitizedResults, batchPlaceholders);

        return normalizeGeminiResponse(batch, restoredResults);
      }

      // Handle HTTP error statuses
      if (res.status === 429) {
        const errJson = await res.json().catch(() => ({}));
        const details = (errJson.error && errJson.error.message) || '';
        if (details.includes('Quota exceeded') && activeModel !== fallbackModel) {
          console.warn(`[GEMINI QUOTA] Quota reached for ${activeModel}. Switching to fallback model ${fallbackModel}...`);
          activeModel = fallbackModel;
          continue;
        }
        const match = details.match(/retry in ([\d.]+)s/i);
        const retrySec = match ? Math.ceil(parseFloat(match[1])) : 0;
        console.warn(`[GEMINI 429] Rate limited: ${details}`);
        if (retrySec > 15) {
          throw {
            status: 429,
            code: 'RATE_LIMITED',
            message: `Translation service rate limited: Please retry in ${retrySec}s.`
          };
        }
        lastError = {
          status: 429,
          code: 'RATE_LIMITED',
          message: `Translation service is temporarily rate limited. ${details}`,
          retryAfterMs: retrySec > 0 ? (retrySec + 1) * 1000 : null
        };
      } else if (res.status === 401 || res.status === 403) {
        throw { status: 401, code: 'AUTHENTICATION_FAILED', message: 'Backend authentication with Gemini API failed.' };
      } else if (res.status >= 500) {
        lastError = { status: res.status, code: 'PROVIDER_ERROR', message: 'Gemini API service is temporarily unavailable.' };
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw {
          status: 400,
          code: 'PROVIDER_BAD_REQUEST',
          message: (errJson.error && errJson.error.message) || 'Translation request rejected by provider.'
        };
      }
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        lastError = { status: 504, code: 'GATEWAY_TIMEOUT', message: 'Translation request timed out.' };
      } else if (err.code === 'AUTHENTICATION_FAILED' || err.code === 'PROVIDER_BAD_REQUEST' || err.code === 'FORBIDDEN_SCRIPT_DETECTED' || err.code === 'RATE_LIMITED') {
        throw err;
      } else {
        lastError = err;
      }
    }

    if (attempt < maxRetries) {
      let delay = Math.pow(2, attempt) * 1000;
      if (lastError && lastError.status === 429) {
        if (lastError.retryAfterMs && lastError.retryAfterMs <= 65000) {
          delay = lastError.retryAfterMs;
        } else {
          delay = (attempt + 1) * 4000;
        }
      }
      console.log(`[GEMINI RETRY] Waiting ${Math.round(delay / 1000)}s before retry ${attempt + 1}/${maxRetries}...`);
      await sleep(delay);
    }
  }

  throw lastError || { status: 500, code: 'TRANSLATION_FAILED', message: 'Translation request failed after retries.' };
}

module.exports = {
  buildGeminiPayload,
  normalizeGeminiResponse,
  translateWithGemini
};
