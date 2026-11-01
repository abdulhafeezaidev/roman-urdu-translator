/**
 * Roman Urdu Translator — Hugging Face Inference Client
 *
 * Calls Hugging Face's serverless router endpoint using OpenAI-compatible schema:
 * https://router.huggingface.co/hf-inference/v1/chat/completions
 *
 * Implements:
 * - Pre-translation placeholder protection for code, URLs, commands, and identifiers
 * - System instructions for Pakistani conversational Roman Urdu
 * - JSON output enforcement
 * - Strict output validation (output-validator.js)
 * - Post-translation placeholder restoration
 */

'use strict';

const { config } = require('./config');
const { buildSystemInstruction } = require('./prompt-builder');
const { protectBatchItems, restoreBatchResults } = require('./placeholder-utils');
const { validateTranslationOutput } = require('./output-validator');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUserPrompt(items) {
  return (
    'Translate each of the following text units into natural conversational Pakistani Roman Urdu using Latin alphabet.\n' +
    'Return a JSON object with key "results": [{ "id": string, "translatedText": string }].\n\n' +
    JSON.stringify(items.map((it) => ({ id: it.id, text: it.text })), null, 2)
  );
}

function normalizeHfResponse(batch, results) {
  return {
    operationId: batch.operationId || 'op_default',
    batchId: batch.batchId || 'batch_default',
    results: results.map((item) => ({
      id: item.id,
      originalText: (batch.items.find((orig) => orig.id === item.id) || {}).text || '',
      translatedText: item.translatedText
    }))
  };
}

async function translateWithHf(batch) {
  if (!config.hfApiKey) {
    throw {
      status: 500,
      code: 'MISSING_API_KEY',
      message: 'Hugging Face API key is not configured on the backend server. Please set HF_API_KEY in .env.'
    };
  }

  // 1. Protect code, URLs, commands, and technical identifiers
  const { protectedItems, batchPlaceholders } = protectBatchItems(batch.items);

  // 2. Build payload for Hugging Face Router
  const model = config.hfModel || 'meta-llama/Llama-3.3-70B-Instruct';
  const endpoint = 'https://router.huggingface.co/v1/chat/completions';

  const systemInstruction =
    buildSystemInstruction() +
    '\n\nIMPORTANT: You must output ONLY a valid JSON object with key "results" containing an array of objects with keys "id" and "translatedText".\n' +
    'Do not include any explanations, markdown code fences, or text outside the JSON object.';

  const userPrompt = buildUserPrompt(protectedItems);

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  };

  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs || 30000);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.hfApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!content) {
          throw new Error('Empty response from Hugging Face.');
        }

        let parsedJson;
        try {
          let cleaned = content.trim();
          if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
          else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
          if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
          cleaned = cleaned.trim();
          parsedJson = JSON.parse(cleaned);
          if (!Array.isArray(parsedJson) && parsedJson.results && Array.isArray(parsedJson.results)) {
            parsedJson = parsedJson.results;
          } else if (!Array.isArray(parsedJson) && parsedJson.items && Array.isArray(parsedJson.items)) {
            parsedJson = parsedJson.items;
          }
        } catch (parseErr) {
          throw new Error(`Invalid JSON output from Hugging Face: ${parseErr.message}`);
        }

        // Quality validation
        const validation = validateTranslationOutput(batch.items, parsedJson);
        if (!validation.valid) {
          throw {
            status: 502,
            code: validation.code || 'TRANSLATION_QUALITY_ERROR',
            message: `Translation rejected by quality validation: ${validation.error}`
          };
        }

        const restored = restoreBatchResults(validation.sanitizedResults, batchPlaceholders);
        return normalizeHfResponse(batch, restored);
      }

      if (res.status === 403) {
        const errJson = await res.json().catch(() => ({}));
        throw {
          status: 403,
          code: 'INSUFFICIENT_PERMISSIONS',
          message: (errJson.error || errJson.message || 'Hugging Face token lacks Inference permissions. In HF token settings, ensure "Make calls to the serverless Inference API" is enabled.')
        };
      } else if (res.status === 401) {
        throw {
          status: 401,
          code: 'AUTHENTICATION_FAILED',
          message: 'Hugging Face authentication failed. Please verify your HF_API_KEY in .env.'
        };
      } else if (res.status === 429 || res.status === 503) {
        const errJson = await res.json().catch(() => ({}));
        lastError = {
          status: res.status,
          code: res.status === 429 ? 'RATE_LIMITED' : 'MODEL_LOADING',
          message: (errJson.error || 'Hugging Face model is temporarily busy or loading.')
        };
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw {
          status: res.status,
          code: 'PROVIDER_ERROR',
          message: errJson.error || `Hugging Face returned status ${res.status}`
        };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        lastError = { status: 504, code: 'GATEWAY_TIMEOUT', message: 'Hugging Face request timed out.' };
      } else if (err.code === 'INSUFFICIENT_PERMISSIONS' || err.code === 'AUTHENTICATION_FAILED') {
        throw err;
      } else {
        lastError = err;
      }
    }

    if (attempt < maxRetries) {
      await sleep(1500 * (attempt + 1));
    }
  }

  throw lastError || new Error('Hugging Face translation failed.');
}

module.exports = {
  translateWithHf,
  buildUserPrompt,
  normalizeHfResponse
};
