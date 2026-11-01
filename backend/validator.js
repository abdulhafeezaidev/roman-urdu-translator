/**
 * Roman Urdu Translator — Request & Payload Validator (Phase 3)
 */

const { config } = require('./config');

/**
 * Validates a translation batch payload.
 *
 * @param {Object} body - Parsed JSON request body
 * @returns {{ valid: boolean, error?: string, code?: string }}
 */
function validateBatchRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      code: 'INVALID_BODY',
      error: 'Request body must be a JSON object.'
    };
  }

  // 1. Validate operationId
  if (!body.operationId || typeof body.operationId !== 'string' || body.operationId.trim().length === 0) {
    return {
      valid: false,
      code: 'MISSING_OPERATION_ID',
      error: 'Field "operationId" is required and must be a non-empty string.'
    };
  }
  if (body.operationId.length > 128) {
    return {
      valid: false,
      code: 'INVALID_OPERATION_ID',
      error: 'Field "operationId" exceeds maximum length of 128 characters.'
    };
  }

  // 2. Validate batchId
  if (!body.batchId || typeof body.batchId !== 'string' || body.batchId.trim().length === 0) {
    return {
      valid: false,
      code: 'MISSING_BATCH_ID',
      error: 'Field "batchId" is required and must be a non-empty string.'
    };
  }
  if (body.batchId.length > 128) {
    return {
      valid: false,
      code: 'INVALID_BATCH_ID',
      error: 'Field "batchId" exceeds maximum length of 128 characters.'
    };
  }

  // 3. Validate items array
  if (!body.items || !Array.isArray(body.items)) {
    return {
      valid: false,
      code: 'MISSING_ITEMS',
      error: 'Field "items" must be an array of translation items.'
    };
  }

  if (body.items.length === 0) {
    return {
      valid: false,
      code: 'EMPTY_BATCH',
      error: 'Batch contains 0 items. At least 1 item is required.'
    };
  }

  if (body.items.length > config.maxBatchItems) {
    return {
      valid: false,
      code: 'BATCH_TOO_LARGE',
      error: `Batch item count (${body.items.length}) exceeds maximum limit of ${config.maxBatchItems} items.`
    };
  }

  // 4. Validate individual items & character totals
  const itemIds = new Set();
  let totalCharacters = 0;

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    if (!item || typeof item !== 'object') {
      return {
        valid: false,
        code: 'MALFORMED_ITEM',
        error: `Item at index ${i} is not a valid object.`
      };
    }

    if (!item.id || typeof item.id !== 'string' || item.id.trim().length === 0) {
      return {
        valid: false,
        code: 'INVALID_ITEM_ID',
        error: `Item at index ${i} is missing a valid non-empty "id" string.`
      };
    }

    if (itemIds.has(item.id)) {
      return {
        valid: false,
        code: 'DUPLICATE_ITEM_ID',
        error: `Duplicate item ID "${item.id}" detected in the same batch.`
      };
    }
    itemIds.add(item.id);

    if (typeof item.text !== 'string') {
      return {
        valid: false,
        code: 'INVALID_ITEM_TEXT',
        error: `Item "${item.id}" must contain a "text" string.`
      };
    }

    const itemCharCount = item.text.length;
    if (itemCharCount > config.maxBatchCharacters) {
      return {
        valid: false,
        code: 'ITEM_TEXT_TOO_LARGE',
        error: `Item "${item.id}" text length (${itemCharCount}) exceeds maximum permitted length of ${config.maxBatchCharacters}.`
      };
    }

    totalCharacters += itemCharCount;
  }

  if (totalCharacters > config.maxBatchCharacters) {
    return {
      valid: false,
      code: 'BATCH_CHARACTERS_EXCEEDED',
      error: `Total batch characters (${totalCharacters}) exceeds maximum limit of ${config.maxBatchCharacters}.`
    };
  }

  return { valid: true };
}

module.exports = {
  validateBatchRequest
};
