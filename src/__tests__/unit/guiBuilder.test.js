import { jest, expect, beforeAll } from '@jest/globals';
import { test, fc } from '@fast-check/jest';

// Mock scheduler before importing guiBuilder so getRemainingMs returns a fixed value
jest.unstable_mockModule('../../services/scheduler.js', () => ({
  getRemainingMs: () => 180000,
}));

let buildPredictionEmbed, buildActionRows, buildLoserMessage;

beforeAll(async () => {
  const guiBuilder = await import('../../ui/guiBuilder.js');
  buildPredictionEmbed = guiBuilder.buildPredictionEmbed;
  buildActionRows = guiBuilder.buildActionRows;
  buildLoserMessage = guiBuilder.buildLoserMessage;
});

// Minimal prediction factory
function makePrediction(overrides = {}) {
  return {
    id: 'test-id',
    description: 'Will it rain?',
    answers: ['Yes', 'No'],
    status: 'ACTIVE',
    votes: new Map(),
    correctAnswerIndex: null,
    cancellationReason: null,
    timeoutMinutes: 3,
    createdAt: Date.now(),
    ...overrides,
  };
}

// Property 13: Active prediction embed contains all required fields
// Validates: Requirements 2.1, 2.2
test.prop([
  fc.record({
    description: fc.string({ minLength: 1, maxLength: 200 }),
    answers: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
  }),
])(
  'active embed contains description and all answer strings',
  ({ description, answers }) => {
    const prediction = makePrediction({ description, answers, status: 'ACTIVE' });
    const embed = buildPredictionEmbed(prediction);
    const data = embed.toJSON();

    expect(data.title).toContain(description);
    for (const answer of answers) {
      const hasAnswer = data.fields?.some((f) => f.name.includes(answer));
      expect(hasAnswer).toBe(true);
    }
  }
);

// Property 12: Finalized embed shows correct answer and all votes
// Validates: Requirements 7.6
test.prop([
  fc.record({
    description: fc.string({ minLength: 1, maxLength: 200 }),
    answers: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
  }).chain(({ description, answers }) =>
    fc.record({
      description: fc.constant(description),
      answers: fc.constant(answers),
      correctAnswerIndex: fc.integer({ min: 0, max: answers.length - 1 }),
    })
  ),
])(
  'finalized embed contains correct answer marker and all answer fields',
  ({ description, answers, correctAnswerIndex }) => {
    const prediction = makePrediction({
      description,
      answers,
      status: 'FINALIZED',
      correctAnswerIndex,
    });
    const embed = buildPredictionEmbed(prediction);
    const data = embed.toJSON();

    // All answers should appear in fields
    for (const answer of answers) {
      const hasAnswer = data.fields?.some((f) => f.name.includes(answer));
      expect(hasAnswer).toBe(true);
    }
    // Correct answer field should have ✅ — match by index position, not substring
    const correctField = data.fields?.[correctAnswerIndex];
    expect(correctField?.name).toContain('✅');
  }
);

// Property 15: Cancelled embed shows reason when provided
// Validates: Requirements 6.4
test.prop([fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0)])(
  'cancelled embed includes reason when non-empty',
  (reason) => {
    const prediction = makePrediction({ status: 'CANCELLED', cancellationReason: reason });
    const embed = buildPredictionEmbed(prediction);
    const data = embed.toJSON();
    const hasReason = data.fields?.some((f) => f.value === reason);
    expect(hasReason).toBe(true);
  }
);

test('cancelled embed with empty reason has no reason field', () => {
  const prediction = makePrediction({ status: 'CANCELLED', cancellationReason: '' });
  const embed = buildPredictionEmbed(prediction);
  const data = embed.toJSON();
  const reasonField = data.fields?.find((f) => f.name === 'Reason');
  expect(reasonField).toBeUndefined();
});

// Property 14: Action rows contain exactly one button per answer (active state)
// Validates: Requirements 2.4
test.prop([fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 })])(
  'active action rows contain exactly N answer buttons',
  (answers) => {
    const prediction = makePrediction({ answers, status: 'ACTIVE' });
    const rows = buildActionRows(prediction);
    const allComponents = rows.flatMap((r) => r.toJSON().components);
    const voteButtons = allComponents.filter(
      (c) => c.custom_id && c.custom_id.startsWith('vote:')
    );
    expect(voteButtons.length).toBe(answers.length);
  }
);

// Property 11: Loser announcement mentions every loser
// Validates: Requirements 7.4
test.prop([fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 })])(
  'buildLoserMessage mentions every loser id',
  (loserIds) => {
    const prediction = makePrediction({ description: 'Test prediction' });
    const msg = buildLoserMessage(prediction, loserIds);
    for (const id of loserIds) {
      expect(msg).toContain(`<@${id}>`);
    }
  }
);

test('buildLoserMessage with no losers returns everyone-correct message', () => {
  const prediction = makePrediction({ description: 'Test' });
  const msg = buildLoserMessage(prediction, []);
  expect(msg).toContain('Everyone');
});
