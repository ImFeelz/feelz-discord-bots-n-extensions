import { test, fc } from '@fast-check/jest';
import { expect } from '@jest/globals';
import {
  validateDescription,
  validateAnswer,
  validateTimeout,
  collectAnswers,
} from '../../utils/validators.js';

// Property 1: Description validation accepts exactly the valid length range
// Validates: Requirements 1.2
test.prop([fc.string({ minLength: 1, maxLength: 200 })])(
  'validateDescription accepts strings of length 1–200',
  (s) => {
    expect(validateDescription(s).valid).toBe(true);
  }
);

test.prop([fc.string({ minLength: 201, maxLength: 500 })])(
  'validateDescription rejects strings longer than 200',
  (s) => {
    expect(validateDescription(s).valid).toBe(false);
  }
);

test.prop([fc.constant('')])(
  'validateDescription rejects empty string (length 0)',
  (s) => {
    expect(validateDescription(s).valid).toBe(false);
  }
);

// Property 2: Answer validation accepts exactly the valid length range
// Validates: Requirements 1.5
test.prop([fc.string({ minLength: 1, maxLength: 50 })])(
  'validateAnswer accepts strings of length 1–50',
  (s) => {
    expect(validateAnswer(s).valid).toBe(true);
  }
);

test.prop([fc.string({ minLength: 51, maxLength: 200 })])(
  'validateAnswer rejects strings longer than 50',
  (s) => {
    expect(validateAnswer(s).valid).toBe(false);
  }
);

test.prop([fc.constant('')])(
  'validateAnswer rejects empty string (length 0)',
  (s) => {
    expect(validateAnswer(s).valid).toBe(false);
  }
);

// Property 3: Timeout validation accepts only positive integers
// Validates: Requirements 1.6
test.prop([fc.integer({ min: 1, max: 1_000_000 }).map(String)])(
  'validateTimeout accepts positive integer strings',
  (s) => {
    expect(validateTimeout(s).valid).toBe(true);
  }
);

test.prop([fc.constant('0')])(
  'validateTimeout rejects "0"',
  (s) => {
    expect(validateTimeout(s).valid).toBe(false);
  }
);

test.prop([fc.integer({ min: 1, max: 1_000_000 }).map((n) => String(-n))])(
  'validateTimeout rejects negative integer strings',
  (s) => {
    expect(validateTimeout(s).valid).toBe(false);
  }
);

test.prop([
  fc.float({ min: 0.1, max: 999.9, noNaN: true, noDefaultInfinity: true })
    .map((n) => n.toFixed(1)),
])(
  'validateTimeout rejects decimal strings',
  (s) => {
    expect(validateTimeout(s).valid).toBe(false);
  }
);

test.prop([
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/^\d+$/.test(s.trim())),
])(
  'validateTimeout rejects non-numeric strings',
  (s) => {
    expect(validateTimeout(s).valid).toBe(false);
  }
);

// Property 4: Answer slot collection preserves order and filters empties
// Validates: Requirements 1.4
test.prop([
  fc.array(
    fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 50 })),
    { minLength: 0, maxLength: 10 }
  ),
])(
  'collectAnswers returns only non-empty slots in original order',
  (slots) => {
    const result = collectAnswers(slots);
    const expected = slots.filter((s) => s.length > 0);
    expect(result).toEqual(expected);
  }
);
