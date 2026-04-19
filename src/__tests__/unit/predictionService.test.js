import { jest, expect, beforeAll, beforeEach } from '@jest/globals';
import { test, fc } from '@fast-check/jest';

// Must mock BEFORE dynamic import of predictionService
jest.unstable_mockModule('../../ui/guiBuilder.js', () => ({
  buildPredictionEmbed: () => ({}),
  buildActionRows: () => [],
  buildLoserMessage: () => '',
}));

jest.unstable_mockModule('../../services/scheduler.js', () => ({
  schedule: () => {},
  cancel: () => {},
  getRemainingMs: () => 60000,
}));

let createPrediction, castVote, lockPrediction, finalizePrediction, setClient, predictions;

beforeAll(async () => {
  const svc = await import('../../services/predictionService.js');
  createPrediction = svc.createPrediction;
  castVote = svc.castVote;
  lockPrediction = svc.lockPrediction;
  finalizePrediction = svc.finalizePrediction;
  setClient = svc.setClient;
  predictions = svc.predictions;
});

function makeInteraction() {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'user-1' },
    reply: jest.fn().mockResolvedValue({ id: 'msg-1' }),
  };
}

function makeMockClient() {
  return {
    channels: {
      fetch: jest.fn().mockResolvedValue({
        send: jest.fn(),
        messages: {
          fetch: jest.fn().mockResolvedValue({ edit: jest.fn() }),
        },
      }),
    },
  };
}

beforeEach(() => {
  predictions.clear();
  setClient(makeMockClient());
});

// Property 5: Prediction creation stores all fields correctly
// Validates: Requirements 1.8
test.prop([
  fc.record({
    description: fc.string({ minLength: 1, maxLength: 200 }),
    answers: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
    timeoutMinutes: fc.integer({ min: 1, max: 60 }),
  }),
])(
  'createPrediction stores description, answers, timeoutMinutes, status, and creatorId correctly',
  async ({ description, answers, timeoutMinutes }) => {
    predictions.clear();
    const interaction = makeInteraction();
    const prediction = await createPrediction(interaction, { description, answers, timeoutMinutes });

    expect(prediction.description).toBe(description);
    expect(prediction.answers).toEqual(answers);
    expect(prediction.timeoutMinutes).toBe(timeoutMinutes);
    expect(prediction.status).toBe('ACTIVE');
    expect(prediction.creatorId).toBe('user-1');
  }
);

// Property 6: Vote casting records the correct answer
// Validates: Requirements 3.1, 3.3
test.prop([
  fc.record({
    userId: fc.string({ minLength: 1, maxLength: 20 }),
    answerIndex: fc.integer({ min: 0, max: 1 }),
  }),
])(
  'castVote records the correct answerIndex for the user',
  async ({ userId, answerIndex }) => {
    predictions.clear();
    const interaction = makeInteraction();
    const prediction = await createPrediction(interaction, {
      description: 'Test',
      answers: ['A', 'B'],
      timeoutMinutes: 3,
    });

    const result = await castVote(prediction.id, userId, 'user', answerIndex);

    expect(result.ok).toBe(true);
    expect(prediction.votes.get(userId)).toBe(answerIndex);
  }
);

// Property 8: Vote changing replaces the previous vote
// Validates: Requirements 3.2, 3.3
test.prop([
  fc.record({
    userId: fc.string({ minLength: 1, maxLength: 20 }),
    firstIndex: fc.integer({ min: 0, max: 1 }),
    secondIndex: fc.integer({ min: 0, max: 1 }),
  }),
])(
  'castVote replaces previous vote with new answerIndex',
  async ({ userId, firstIndex, secondIndex }) => {
    predictions.clear();
    const interaction = makeInteraction();
    const prediction = await createPrediction(interaction, {
      description: 'Test',
      answers: ['A', 'B'],
      timeoutMinutes: 3,
    });

    await castVote(prediction.id, userId, 'user', firstIndex);
    await castVote(prediction.id, userId, 'user', secondIndex);

    expect(prediction.votes.get(userId)).toBe(secondIndex);
    expect(prediction.votes.size).toBe(1);
  }
);

// Property 9: Locked predictions reject all vote attempts
// Validates: Requirements 5.2
test.prop([
  fc.record({
    userId: fc.string({ minLength: 1, maxLength: 20 }),
    answerIndex: fc.integer({ min: 0, max: 1 }),
  }),
])(
  'castVote returns not_active for locked predictions and votes Map is unchanged',
  async ({ userId, answerIndex }) => {
    predictions.clear();
    const interaction = makeInteraction();
    const prediction = await createPrediction(interaction, {
      description: 'Test',
      answers: ['A', 'B'],
      timeoutMinutes: 3,
    });

    await lockPrediction(prediction.id, 'manual');
    const votesBefore = prediction.votes.size;

    const result = await castVote(prediction.id, userId, 'user', answerIndex);

    expect(result.ok).toBe(false);
    expect(prediction.votes.size).toBe(votesBefore);
  }
);

// Property 10: Loser identification is correct for all vote distributions
// Validates: Requirements 7.3
test.prop([
  fc.record({
    votes: fc.array(
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 20 }),
        answerIndex: fc.integer({ min: 0, max: 1 }),
      }),
      { minLength: 0, maxLength: 10 }
    ),
    correctAnswerIndex: fc.integer({ min: 0, max: 1 }),
  }),
])(
  'finalizePrediction sets status to FINALIZED and correctAnswerIndex correctly',
  async ({ votes, correctAnswerIndex }) => {
    predictions.clear();
    const interaction = makeInteraction();
    const prediction = await createPrediction(interaction, {
      description: 'Test',
      answers: ['A', 'B'],
      timeoutMinutes: 3,
    });

    // Deduplicate votes by userId (last one wins, matching castVote behavior)
    const uniqueVotes = new Map();
    for (const { userId, answerIndex } of votes) {
      uniqueVotes.set(userId, answerIndex);
    }

    for (const [userId, answerIndex] of uniqueVotes) {
      await castVote(prediction.id, userId, 'user', answerIndex);
    }

    await lockPrediction(prediction.id, 'manual');
    await finalizePrediction(prediction.id, correctAnswerIndex);

    expect(prediction.status).toBe('FINALIZED');
    expect(prediction.correctAnswerIndex).toBe(correctAnswerIndex);

    // Every vote that isn't the correct answer belongs to a loser
    for (const [userId, answerIndex] of prediction.votes) {
      if (answerIndex !== correctAnswerIndex) {
        expect(uniqueVotes.get(userId)).toBe(answerIndex);
      }
    }
  }
);
