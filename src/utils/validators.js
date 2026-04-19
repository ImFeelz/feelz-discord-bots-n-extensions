/**
 * Validates the prediction description.
 * @param {string} value
 * @returns {{ valid: true } | { valid: false, error: string }}
 */
export function validateDescription(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) {
    return { valid: false, error: 'Prediction description must be between 1 and 200 characters.' };
  }
  return { valid: true };
}

/**
 * Validates a single answer slot (only called on non-empty slots).
 * @param {string} value
 * @returns {{ valid: true } | { valid: false, error: string }}
 */
export function validateAnswer(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 50) {
    return { valid: false, error: 'Each answer must be between 1 and 50 characters.' };
  }
  return { valid: true };
}

/**
 * Validates the lock timeout — must be a positive integer string (≥ 1, no decimals).
 * @param {string} value
 * @returns {{ valid: true } | { valid: false, error: string }}
 */
export function validateTimeout(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    return { valid: false, error: 'Lock timeout must be a positive whole number of minutes.' };
  }
  const num = parseInt(value.trim(), 10);
  if (num < 1) {
    return { valid: false, error: 'Lock timeout must be at least 1 minute.' };
  }
  return { valid: true };
}

/**
 * Filters empty strings from answer slots and returns an ordered array of non-empty values.
 * @param {string[]} slots
 * @returns {string[]}
 */
export function collectAnswers(slots) {
  return slots.filter((slot) => typeof slot === 'string' && slot.length > 0);
}
