/**
 * Roman Urdu Translator — Groq Cloud Inference Client
 *
 * Ultra-fast LPU inference via Groq Cloud (OpenAI-compatible schema):
 * https://api.groq.com/openai/v1/chat/completions
 *
 * Implements:
 * - Pre-translation placeholder protection for code, URLs, commands, and identifiers
 * - System instructions for natural conversational Pakistani Roman Urdu
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

function normalizeGroqResponse(batch, results) {
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

async function translateWithGroq(batch) {
  if (!config.groqApiKey) {
    throw {
      status: 500,
      code: 'MISSING_API_KEY',
      message: 'Groq API key is not configured on the backend server. Please set GROQ_API_KEY in .env.'
    };
  }

  // 1. Protect code, URLs, commands, and technical identifiers
  const { protectedItems, batchPlaceholders } = protectBatchItems(batch.items);

  // 2. Build payload for Groq
  const model = config.groqModel || 'openai/gpt-oss-120b';
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

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
          Authorization: `Bearer ${config.groqApiKey}`,
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
          throw new Error('Empty response from Groq.');
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
          throw new Error(`Invalid JSON output from Groq: ${parseErr.message}`);
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
        return normalizeGroqResponse(batch, restored);
      }

      if (res.status === 401) {
        throw {
          status: 401,
          code: 'AUTHENTICATION_FAILED',
          message: 'Groq authentication failed. Please check GROQ_API_KEY in .env.'
        };
      } else if (res.status === 429) {
        const errJson = await res.json().catch(() => ({}));
        lastError = {
          status: 429,
          code: 'RATE_LIMITED',
          message: errJson.error?.message || 'Groq rate limit reached. Please wait a moment.'
        };
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw {
          status: res.status,
          code: 'PROVIDER_ERROR',
          message: errJson.error?.message || `Groq returned status ${res.status}`
        };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        lastError = { status: 504, code: 'GATEWAY_TIMEOUT', message: 'Groq request timed out.' };
      } else if (err.code === 'AUTHENTICATION_FAILED') {
        throw err;
      } else {
        lastError = err;
      }
    }

    if (attempt < maxRetries) {
      await sleep(1500 * (attempt + 1));
    }
  }

  throw lastError || new Error('Groq translation failed.');
}

module.exports = {
  translateWithGroq,
  buildUserPrompt,
  normalizeGroqResponse
};
