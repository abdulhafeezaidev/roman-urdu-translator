/**
 * Roman Urdu Translator — Protected Content & Placeholder Utilities (Phase 4)
 *
 * Protects sensitive technical elements before translation:
 * - Backtick code (`...`)
 * - URLs (https://..., http://...)
 * - CLI commands with standard subcommands & arguments (npm install ..., git clone ...)
 * - File paths & endpoints (/api/users, C:\path\to\file)
 * - Identifiers & function calls (getUser(), process.env.API_KEY)
 * - Email addresses
 */

const PATTERNS = [
  // 1. Backtick code blocks/spans: `...`
  /`[^`\n]+`/g,

  // 2. Explicit URLs (excluding trailing sentence punctuation like periods or commas)
  /\bhttps?:\/\/[^\s"'<>()[\]]*[A-Za-z0-9_/#~]/gi,

  // 3. Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,

  // 4. CLI commands with recognized command tools, subcommands, and flags/arguments
  /\b(?:npm|npx|yarn|pnpm|git|docker|node|python|python3|pip|pip3|curl|cargo|brew)\s+(?:install|i|add|run|clone|build|test|start|exec|init|pull|push|checkout|commit|status|diff|-m)(?:\s+--?[A-Za-z0-9._/\\:=~@-]+)*(?:\s+[A-Za-z0-9._/\\:=~@-]+)?\b/gi,

  // 5. Windows absolute file paths: C:\Users\... or D:\project\...
  /\b[a-zA-Z]:\\(?:[a-zA-Z0-9._-]+\\)*[a-zA-Z0-9._-]+/g,

  // 6. Explicit Unix/API paths: /api/v1/... or /users/...
  /(?<=\s|^)\/(?:[a-zA-Z0-9._-]+\/)+[a-zA-Z0-9._-]*(?=\s|[.,;!?]|$)/g,

  // 7. Environment variables / system properties: process.env.XYZ
  /\bprocess\.env\.[A-Z0-9_]+\b/g,

  // 8. Function calls: functionName()
  /\b[a-zA-Z_$][a-zA-Z0-9_$]*\(\w*\)/g
];

/**
 * Protects code and sensitive tokens in a string by substituting placeholders.
 *
 * @param {string} text - Raw input text
 * @param {number} [startCounter=0] - Starting placeholder counter
 * @returns {{ text: string, placeholders: Map<string, string>, nextCounter: number }}
 */
function protectText(text, startCounter = 0) {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: '', placeholders: new Map(), nextCounter: startCounter };
  }

  const placeholders = new Map();
  let counter = startCounter;
  let protectedText = text;

  for (const pattern of PATTERNS) {
    protectedText = protectedText.replace(pattern, (match) => {
      // Do not re-wrap an existing placeholder
      if (match.startsWith('__PROT_') && match.endsWith('__')) {
        return match;
      }
      const placeholder = `__PROT_${counter++}__`;
      placeholders.set(placeholder, match);
      return placeholder;
    });
  }

  return {
    text: protectedText,
    placeholders,
    nextCounter: counter
  };
}

/**
 * Restores placeholders in a translated string back to original values.
 * Uses iterative replacement to resolve any nested placeholders.
 *
 * @param {string} translatedText - Translated text containing placeholders
 * @param {Map<string, string>} placeholders - Map of placeholder -> original value
 * @returns {string} Fully restored string
 */
function restoreText(translatedText, placeholders) {
  if (typeof translatedText !== 'string' || !placeholders || placeholders.size === 0) {
    return translatedText || '';
  }

  let restored = translatedText;
  let iterations = 0;
  const maxIterations = 5;

  while (/__PROT_\d+__/i.test(restored) && iterations < maxIterations) {
    iterations++;
    let replacedAny = false;

    for (const [placeholder, original] of placeholders.entries()) {
      const escaped = placeholder.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      if (regex.test(restored)) {
        restored = restored.replace(regex, original);
        replacedAny = true;
      }
    }

    if (!replacedAny) break;
  }

  return restored;
}

/**
 * Pre-processes an entire batch of translation items, substituting placeholders.
 *
 * @param {Array<{id: string, text: string}>} items
 * @returns {{ protectedItems: Array<{id: string, text: string}>, batchPlaceholders: Map<string, Map<string, string>> }}
 */
function protectBatchItems(items) {
  const protectedItems = [];
  const batchPlaceholders = new Map();

  let globalCounter = 0;

  for (const item of items) {
    const res = protectText(item.text, globalCounter);
    globalCounter = res.nextCounter;

    protectedItems.push({
      id: item.id,
      text: res.text
    });

    batchPlaceholders.set(item.id, res.placeholders);
  }

  return {
    protectedItems,
    batchPlaceholders
  };
}

/**
 * Post-processes translation results, restoring exact original tokens per item.
 *
 * @param {Array<{id: string, translatedText: string, originalText: string}>} results
 * @param {Map<string, Map<string, string>>} batchPlaceholders
 * @returns {Array<{id: string, translatedText: string, originalText: string}>}
 */
function restoreBatchResults(results, batchPlaceholders) {
  if (!Array.isArray(results) || !batchPlaceholders) {
    return results;
  }

  return results.map((item) => {
    const itemPlaceholders = batchPlaceholders.get(item.id);
    if (!itemPlaceholders || itemPlaceholders.size === 0) {
      return item;
    }

    return {
      ...item,
      translatedText: restoreText(item.translatedText, itemPlaceholders)
    };
  });
}

module.exports = {
  protectText,
  restoreText,
  protectBatchItems,
  restoreBatchResults
};
