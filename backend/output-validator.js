/**
 * Roman Urdu Translator — Translation Output Validator (Phase 4)
 *
 * Enforces quality, script, and contract standards:
 * 1. Structured integrity (array of objects with id and translatedText)
 * 2. Exact 1:1 ID match (no missing IDs, no unexpected IDs, no duplicates)
 * 3. Strict Latin script enforcement (zero Urdu/Arabic or Devanagari script)
 * 4. Meta-commentary removal/rejection (e.g. "Here is the translation:")
 * 5. Meaning and non-empty content validation
 */

// Regex ranges for forbidden non-Latin scripts
const ARABIC_URDU_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const DEVANAGARI_HINDI_SCRIPT_REGEX = /[\u0900-\u097F]/;

// Common LLM conversational prefixes to strip or detect
const META_COMMENTARY_PATTERNS = [
  /^(?:Here is the translation|Here are the translations|Translation|Translated text|Output):\s*/i,
  /^(?:Sure|Certainly|Of course)[\s!,.-]+(?:here is the translation|here are the translations)?:\s*/i,
  /^Note:\s+.*$/im
];

/**
 * Checks if a string contains forbidden non-Latin script characters.
 *
 * @param {string} text
 * @returns {{ hasForbiddenScript: boolean, scriptType?: string }}
 */
function checkForbiddenScript(text) {
  if (typeof text !== 'string') return { hasForbiddenScript: false };

  if (ARABIC_URDU_SCRIPT_REGEX.test(text)) {
    return { hasForbiddenScript: true, scriptType: 'Urdu/Arabic' };
  }
  if (DEVANAGARI_HINDI_SCRIPT_REGEX.test(text)) {
    return { hasForbiddenScript: true, scriptType: 'Devanagari/Hindi' };
  }

  return { hasForbiddenScript: false };
}

/**
 * Cleans conversational meta-commentary from translated text.
 *
 * @param {string} text
 * @returns {string} Cleaned text
 */
function cleanMetaCommentary(text) {
  if (typeof text !== 'string') return '';
  let cleaned = text.trim();

  for (const pattern of META_COMMENTARY_PATTERNS) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  return cleaned;
}

/**
 * Validates the raw translation results returned from Gemini.
 *
 * @param {Array<{id: string, text: string}>} expectedItems - The original input items requested
 * @param {Array<Object>} rawResults - Parsed JSON array returned from Gemini
 * @returns {{ valid: boolean, error?: string, code?: string, sanitizedResults?: Array<{id: string, translatedText: string}> }}
 */
function validateTranslationOutput(expectedItems, rawResults) {
  if (!Array.isArray(rawResults)) {
    return {
      valid: false,
      code: 'INVALID_OUTPUT_FORMAT',
      error: 'Gemini output must be a JSON array of result objects.'
    };
  }

  const expectedIds = new Set(expectedItems.map(item => item.id));
  const seenResultIds = new Set();
  const sanitizedResults = [];

  for (let i = 0; i < rawResults.length; i++) {
    const item = rawResults[i];

    if (!item || typeof item !== 'object') {
      return {
        valid: false,
        code: 'MALFORMED_RESULT_ITEM',
        error: `Result item at index ${i} is not a valid object.`
      };
    }

    if (!item.id || typeof item.id !== 'string') {
      return {
        valid: false,
        code: 'MISSING_RESULT_ID',
        error: `Result item at index ${i} is missing an "id" string.`
      };
    }

    // Check for unexpected extra IDs
    if (!expectedIds.has(item.id)) {
      return {
        valid: false,
        code: 'UNEXPECTED_RESULT_ID',
        error: `Result item contained unexpected id "${item.id}" which was not in the batch request.`
      };
    }

    // Check for duplicate IDs in response
    if (seenResultIds.has(item.id)) {
      return {
        valid: false,
        code: 'DUPLICATE_RESULT_ID',
        error: `Duplicate result id "${item.id}" returned in model response.`
      };
    }
    seenResultIds.add(item.id);

    // Validate translatedText
    if (typeof item.translatedText !== 'string' || item.translatedText.trim().length === 0) {
      return {
        valid: false,
        code: 'EMPTY_TRANSLATION_TEXT',
        error: `Result item "${item.id}" contains empty or non-string "translatedText".`
      };
    }

    // Check forbidden scripts
    const scriptCheck = checkForbiddenScript(item.translatedText);
    if (scriptCheck.hasForbiddenScript) {
      return {
        valid: false,
        code: 'FORBIDDEN_SCRIPT_DETECTED',
        error: `Result item "${item.id}" contains forbidden ${scriptCheck.scriptType} script. Only Latin Roman Urdu is allowed.`
      };
    }

    // Clean any accidental meta-commentary
    const cleanedText = cleanMetaCommentary(item.translatedText);
    if (cleanedText.length === 0) {
      return {
        valid: false,
        code: 'EMPTY_TRANSLATION_TEXT',
        error: `Result item "${item.id}" became empty after removing meta-commentary.`
      };
    }

    // Placeholder integrity check: ensure placeholders in input are retained in output
    const expectedItem = expectedItems.find(exp => exp.id === item.id);
    if (expectedItem && typeof expectedItem.text === 'string') {
      const inputPlaceholders = expectedItem.text.match(/__PROT_\d+__/g) || [];
      for (const ph of inputPlaceholders) {
        if (!cleanedText.includes(ph)) {
          return {
            valid: false,
            code: 'PLACEHOLDER_CORRUPTED',
            error: `Result item "${item.id}" dropped protected placeholder "${ph}".`
          };
        }
      }
    }

    sanitizedResults.push({
      id: item.id,
      translatedText: cleanedText
    });
  }

  // Verify all requested IDs exist in response
  for (const expectedItem of expectedItems) {
    if (!seenResultIds.has(expectedItem.id)) {
      return {
        valid: false,
        code: 'MISSING_REQUESTED_ID',
        error: `Model response is missing translation for item "${expectedItem.id}".`
      };
    }
  }

  return {
    valid: true,
    sanitizedResults
  };
}

module.exports = {
  checkForbiddenScript,
  cleanMetaCommentary,
  validateTranslationOutput
};
