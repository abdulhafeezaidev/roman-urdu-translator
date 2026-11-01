/**
 * Roman Urdu Translator — Multi-Provider Parallel Pool (Phase 9)
 *
 * Dispatches translation batches across all available LLM APIs (Groq + Gemini simultaneously)
 * with automatic round-robin load balancing, latency optimization, and transparent failover.
 *
 * Capabilities:
 * - Automatically discovers active providers from configured API keys
 * - Concurrently distributes batches across providers (e.g. Batch 0 -> Groq, Batch 1 -> Gemini)
 * - Automatic failover: if one provider encounters a rate limit (429) or transient error,
 *   the batch is seamlessly retried on an alternate healthy provider
 * - Enforces identical Pakistani Roman Urdu schema and contracts across all providers
 */

'use strict';

const { config } = require('./config');
const { translateWithGroq } = require('./groq-client');
const { translateWithGemini } = require('./gemini-client');
const { translateWithHf } = require('./hf-client');

/**
 * Returns a list of all currently configured and active provider names.
 *
 * @returns {string[]}
 */
function getAvailableProviders() {
  const providers = [];
  if (config.groqApiKey) {
    providers.push('groq');
  }
  if (config.geminiApiKey) {
    providers.push('gemini');
  }
  if (config.hfApiKey) {
    providers.push('huggingface');
  }
  return providers;
}

/**
 * Determines the active provider pool based on config.
 * If provider is 'all' or multiple keys exist without a forced single provider,
 * pool includes all active providers.
 *
 * @returns {string[]}
 */
function getActiveProviderPool() {
  const available = getAvailableProviders();
  if (available.length === 0) {
    return ['gemini']; // Fallback to mock/default
  }

  const configured = (config.provider || 'all').toLowerCase();
  if (configured === 'all' || configured === 'multi' || configured === 'pool') {
    return available;
  }

  // Comma-separated list of providers, e.g. 'groq,gemini'
  if (configured.includes(',')) {
    const requested = configured.split(',').map((s) => s.trim()).filter(Boolean);
    const filtered = requested.filter((p) => available.includes(p));
    return filtered.length > 0 ? filtered : available;
  }

  // Single explicit provider requested
  if (available.includes(configured)) {
    return [configured];
  }

  return available;
}

let roundRobinIndex = 0;
const providerHealth = new Map(); // provider -> { failures: number, backoffUntil: number }

/**
 * Dispatches a batch to a specific provider adapter.
 *
 * @param {string} provider
 * @param {Object} batch
 * @returns {Promise<Object>}
 */
async function callProvider(provider, batch) {
  switch (provider) {
    case 'groq':
      return await translateWithGroq(batch);
    case 'gemini':
      return await translateWithGemini(batch);
    case 'huggingface':
      return await translateWithHf(batch);
    default:
      return await translateWithGemini(batch);
  }
}

/**
 * Translates a batch using the Multi-Provider Parallel Pool.
 * Automatically selects the next healthy provider in the pool,
 * and immediately falls over to an alternate provider if any error occurs.
 *
 * @param {Object} batch
 * @returns {Promise<Object>}
 */
async function translateWithProviderPool(batch) {
  const pool = getActiveProviderPool();

  if (pool.length === 1) {
    return await callProvider(pool[0], batch);
  }

  const now = Date.now();
  // Filter for providers that are not in a temporary backoff
  const healthyProviders = pool.filter((p) => {
    const health = providerHealth.get(p);
    return !health || health.backoffUntil <= now;
  });

  // If all are in backoff, try any available provider in the pool
  const candidatePool = healthyProviders.length > 0 ? healthyProviders : pool;

  // Round-robin selection across candidate pool
  const startIndex = Math.abs(roundRobinIndex++) % candidatePool.length;
  const orderedProviders = [];
  for (let i = 0; i < candidatePool.length; i++) {
    orderedProviders.push(candidatePool[(startIndex + i) % candidatePool.length]);
  }

  let lastError = null;

  for (const provider of orderedProviders) {
    try {
      const result = await callProvider(provider, batch);
      // Reset failure count on success
      providerHealth.set(provider, { failures: 0, backoffUntil: 0 });
      return {
        ...result,
        providerUsed: provider
      };
    } catch (err) {
      lastError = err;
      const isRateLimit = err.status === 429 || (err.code && err.code.includes('RATE_LIMITED'));
      const backoffDuration = isRateLimit ? 30000 : 5000;
      console.warn(
        `[ProviderPool] Provider "${provider}" failed for batch "${batch.batchId}" (${err.message || err.code}). ` +
        `Failing over to next available provider...`
      );
      providerHealth.set(provider, {
        failures: (providerHealth.get(provider)?.failures || 0) + 1,
        backoffUntil: Date.now() + backoffDuration
      });
    }
  }

  // If all candidate pool providers failed, re-throw last error
  throw lastError || new Error('All available translation providers in the pool failed.');
}

module.exports = {
  getAvailableProviders,
  getActiveProviderPool,
  translateWithProviderPool,
  callProvider
};
