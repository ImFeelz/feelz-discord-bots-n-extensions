import { jest, expect, beforeAll, beforeEach } from '@jest/globals';
import { test, fc } from '@fast-check/jest';

// Must mock BEFORE dynamic import of predictionService
jest.unstable_mockModule('../../ui/guiBuilder.js', () => ({
  buildPredictionEmbed: () => ({}),
  buildActionRows: () => [],
  buildLoserMessage: () => '',
}));

// Mutable tracker for scheduler.cancel calls (used by Property 5 test)
const schedulerCancelTracker = { impl: null };

jest.unstable_mockModule('../../services/scheduler.js', () => ({
  schedule: jest.fn(),
  cancel: jest.fn((id) => {
    if (schedulerCancelTracker.impl) schedulerCancelTracker.impl(id);
  }),
  getRemainingMs: jest.fn(() => 60000),
}));

let createPrediction, castVote, lockPrediction, finalizePrediction, cancelPrediction, setClient, predictions, _runSweep, startCleanupSweep, stopCleanupSweep;
let schedulerMock;

beforeAll(async () => {
  const svc = await import('../../services/predictionService.js');
  createPrediction = svc.createPrediction;
  castVote = svc.castVote;
  lockPrediction = svc.lockPrediction;
  finalizePrediction = svc.finalizePrediction;
  cancelPrediction = svc.cancelPrediction;
  setClient = svc.setClient;
  predictions = svc.predictions;
  _runSweep = svc._runSweep;
  startCleanupSweep = svc.startCleanupSweep;
  stopCleanupSweep = svc.stopCleanupSweep;
  schedulerMock = await import('../../services/scheduler.js');
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

// Feature: prediction-memory-cleanup, Property 1: Terminal-state eviction removes prediction from Map
// Validates: Requirements 1.1, 1.2
test.prop([
  fc.record({
    description: fc.string({ minLength: 1, maxLength: 200 }),
    answers: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
    timeoutMinutes: fc.integer({ min: 1, max: 60 }),
    correctAnswerIndex: fc.integer({ min: 0, max: 1 }),
  }),
])(
  'finalizePrediction removes prediction from Map after completing side-effects',
  async ({ description, answers, timeoutMinutes, correctAnswerIndex }) => {
    predictions.clear();
    const interaction = makeInteraction();
    const prediction = await createPrediction(interaction, { description, answers, timeoutMinutes });
    const id = prediction.id;

    await lockPrediction(id, 'manual');
    await finalizePrediction(id, correctAnswerIndex % answers.length);

    expect(predictions.has(id)).toBe(false);
  }
);

// Feature: prediction-memory-cleanup, Property 1: Terminal-state eviction removes prediction from Map
// Validates: Requirements 1.1, 1.2
test.prop([
  fc.record({
    description: fc.string({ minLength: 1, maxLength: 200 }),
    answers: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
    timeoutMinutes: fc.integer({ min: 1, max: 60 }),
    cancellationReason: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  }),
])(
  'cancelPrediction removes prediction from Map after completing side-effects',
  async ({ description, answers, timeoutMinutes, cancellationReason }) => {
    predictions.clear();
    const interaction = makeInteraction();
    const prediction = await createPrediction(interaction, { description, answers, timeoutMinutes });
    const id = prediction.id;

    await cancelPrediction(id, cancellationReason);

    expect(predictions.has(id)).toBe(false);
  }
);

// Feature: prediction-memory-cleanup, Property 2: Side-effects complete before eviction
// Validates: Requirements 1.3, 1.4
test.prop([
  fc.record({
    description: fc.string({ minLength: 1, maxLength: 200 }),
    answers: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
    timeoutMinutes: fc.integer({ min: 1, max: 60 }),
    correctAnswerIndex: fc.integer({ min: 0, max: 1 }),
  }),
])(
  'finalizePrediction calls channel.send before removing prediction from Map',
  async ({ description, answers, timeoutMinutes, correctAnswerIndex }) => {
    predictions.clear();
    const interaction = makeInteraction();
    const prediction = await createPrediction(interaction, { description, answers, timeoutMinutes });
    const id = prediction.id;

    // Override the mock client so we can spy on channel.send and capture Map state at call time
    let predictionPresentAtSendTime = null;
    const mockClient = {
      channels: {
        fetch: jest.fn().mockImplementation(async () => ({
          send: jest.fn().mockImplementation(async () => {
            predictionPresentAtSendTime = predictions.has(id);
          }),
          messages: {
            fetch: jest.fn().mockResolvedValue({ edit: jest.fn() }),
          },
        })),
      },
    };
    setClient(mockClient);

    await lockPrediction(id, 'manual');
    await finalizePrediction(id, correctAnswerIndex % answers.length);

    expect(predictionPresentAtSendTime).toBe(true);
    expect(predictions.has(id)).toBe(false);
  }
);

// Feature: prediction-memory-cleanup, Property 3: Missing-ID operations are no-ops
// Validates: Requirements 1.5, 4.2
test.prop([fc.string()])(
  'finalizePrediction and cancelPrediction with a missing ID do not throw and leave Map size unchanged',
  async (randomId) => {
    predictions.clear();
    const sizeBefore = predictions.size; // 0

    await expect(finalizePrediction(randomId, 0)).resolves.toBeUndefined();
    expect(predictions.size).toBe(sizeBefore);

    await expect(cancelPrediction(randomId, null)).resolves.toBeUndefined();
    expect(predictions.size).toBe(sizeBefore);
  }
);

// Feature: prediction-memory-cleanup, Property 2: Side-effects complete before eviction
// Validates: Requirements 1.3, 1.4
test.prop([
  fc.record({
    description: fc.string({ minLength: 1, maxLength: 200 }),
    answers: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 5 }),
    timeoutMinutes: fc.integer({ min: 1, max: 60 }),
    cancellationReason: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  }),
])(
  'cancelPrediction calls message.edit (updateGui) before removing prediction from Map',
  async ({ description, answers, timeoutMinutes, cancellationReason }) => {
    predictions.clear();
    const interaction = makeInteraction();
    const prediction = await createPrediction(interaction, { description, answers, timeoutMinutes });
    const id = prediction.id;

    // Override the mock client so message.edit captures Map state at call time
    let predictionPresentAtEditTime = null;
    const mockClient = {
      channels: {
        fetch: jest.fn().mockImplementation(async () => ({
          send: jest.fn(),
          messages: {
            fetch: jest.fn().mockResolvedValue({
              edit: jest.fn().mockImplementation(async () => {
                predictionPresentAtEditTime = predictions.has(id);
              }),
            }),
          },
        })),
      },
    };
    setClient(mockClient);

    await cancelPrediction(id, cancellationReason);

    expect(predictionPresentAtEditTime).toBe(true);
    expect(predictions.has(id)).toBe(false);
  }
);

// Feature: prediction-memory-cleanup, Property 4: Sweep removes exactly the stale predictions
// Validates: Requirements 2.3, 2.5, 4.1
test.prop([
  fc.array(
    fc.record({
      id: fc.uuid(),
      offsetMs: fc.integer({ min: 1, max: 1_000_000 }),
      isStale: fc.boolean(),
    }),
    { minLength: 0, maxLength: 20 }
  ),
  fc.integer({ min: 1, max: 86_400_000 }),
])(
  '_runSweep removes exactly stale predictions and leaves fresh ones intact',
  (entries, ageThresholdMs) => {
    predictions.clear();

    const now = Date.now();
    const staleIds = new Set();
    const freshIds = new Set();

    for (const { id, offsetMs, isStale } of entries) {
      // Avoid duplicate IDs
      if (predictions.has(id)) continue;

      const createdAt = isStale
        ? now - ageThresholdMs - offsetMs   // older than threshold → stale
        : now - ageThresholdMs + offsetMs;  // newer than threshold → fresh (offset must be > 0)

      predictions.set(id, {
        id,
        guildId: 'g',
        channelId: 'c',
        messageId: 'm',
        creatorId: 'u',
        description: 'test',
        answers: ['A', 'B'],
        status: 'ACTIVE',
        correctAnswerIndex: null,
        cancellationReason: null,
        timeoutMinutes: 5,
        createdAt,
        votes: new Map(),
      });

      if (isStale) {
        staleIds.add(id);
      } else {
        freshIds.add(id);
      }
    }

    _runSweep(ageThresholdMs);

    // All stale predictions must be gone
    for (const id of staleIds) {
      expect(predictions.has(id)).toBe(false);
    }

    // All fresh predictions must remain
    for (const id of freshIds) {
      expect(predictions.has(id)).toBe(true);
    }
  }
);

// Feature: prediction-memory-cleanup, Property 5: Scheduler timer cancelled for every evicted stale prediction
// Validates: Requirements 2.4
test.prop([
  fc.array(
    fc.record({
      id: fc.uuid(),
      offsetMs: fc.integer({ min: 1, max: 1_000_000 }),
      isStale: fc.boolean(),
    }),
    { minLength: 1, maxLength: 20 }
  ),
  fc.integer({ min: 1, max: 86_400_000 }),
])(
  'scheduler.cancel is called with each stale prediction ID before it is removed from the Map',
  (entries, ageThresholdMs) => {
    predictions.clear();

    const now = Date.now();
    const staleIds = new Set();

    for (const { id, offsetMs, isStale } of entries) {
      if (predictions.has(id)) continue;

      const createdAt = isStale
        ? now - ageThresholdMs - offsetMs
        : now - ageThresholdMs + offsetMs;

      predictions.set(id, {
        id,
        guildId: 'g',
        channelId: 'c',
        messageId: 'm',
        creatorId: 'u',
        description: 'test',
        answers: ['A', 'B'],
        status: 'ACTIVE',
        correctAnswerIndex: null,
        cancellationReason: null,
        timeoutMinutes: 5,
        createdAt,
        votes: new Map(),
      });

      if (isStale) staleIds.add(id);
    }

    // Track whether each stale prediction was still in the Map when cancel was called
    const cancelledWhilePresent = new Map();
    schedulerCancelTracker.impl = (id) => {
      cancelledWhilePresent.set(id, predictions.has(id));
    };
    schedulerMock.cancel.mockClear();

    _runSweep(ageThresholdMs);

    // scheduler.cancel must have been called for every stale ID
    for (const id of staleIds) {
      expect(cancelledWhilePresent.has(id)).toBe(true);
      // cancel was called while the entry was still present in the Map
      expect(cancelledWhilePresent.get(id)).toBe(true);
      // entry is now removed
      expect(predictions.has(id)).toBe(false);
    }

    schedulerCancelTracker.impl = null;
  }
);

// Feature: prediction-memory-cleanup, Property 6: Log emitted if and only if sweep removes entries
// Validates: Requirements 3.1, 3.2
test.prop([
  fc.array(
    fc.record({
      id: fc.uuid(),
      offsetMs: fc.integer({ min: 1, max: 1_000_000 }),
      isStale: fc.boolean(),
    }),
    { minLength: 0, maxLength: 20 }
  ),
  fc.integer({ min: 1, max: 86_400_000 }),
])(
  'console.log is called exactly once when entries are removed by _runSweep, and not called when none are removed',
  (entries, ageThresholdMs) => {
    predictions.clear();

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const now = Date.now();
    let staleCount = 0;

    for (const { id, offsetMs, isStale } of entries) {
      if (predictions.has(id)) continue;

      const createdAt = isStale
        ? now - ageThresholdMs - offsetMs   // older than threshold → stale
        : now - ageThresholdMs + offsetMs;  // newer than threshold → fresh

      predictions.set(id, {
        id,
        guildId: 'g',
        channelId: 'c',
        messageId: 'm',
        creatorId: 'u',
        description: 'test',
        answers: ['A', 'B'],
        status: 'ACTIVE',
        correctAnswerIndex: null,
        cancellationReason: null,
        timeoutMinutes: 5,
        createdAt,
        votes: new Map(),
      });

      if (isStale) staleCount++;
    }

    _runSweep(ageThresholdMs);

    if (staleCount > 0) {
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    } else {
      expect(consoleSpy).not.toHaveBeenCalled();
    }

    consoleSpy.mockRestore();
  }
);

// Feature: prediction-memory-cleanup, Unit tests for startCleanupSweep / stopCleanupSweep
// Validates: Requirements 2.1, 2.2, 2.6, 2.7

describe('startCleanupSweep / stopCleanupSweep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    predictions.clear();
    stopCleanupSweep();
  });

  afterEach(() => {
    stopCleanupSweep();
    jest.useRealTimers();
  });

  test('default arguments fire sweep after 3,600,000 ms', () => {
    // Add a stale prediction (older than 24 hours) so the sweep has something to remove
    const now = Date.now();
    const staleId = 'stale-default-test';
    predictions.set(staleId, {
      id: staleId,
      guildId: 'g',
      channelId: 'c',
      messageId: 'm',
      creatorId: 'u',
      description: 'test',
      answers: ['A', 'B'],
      status: 'ACTIVE',
      correctAnswerIndex: null,
      cancellationReason: null,
      timeoutMinutes: 5,
      createdAt: now - 86_400_001, // just over 24 hours old
      votes: new Map(),
    });

    startCleanupSweep(); // default intervalMs = 3_600_000, ageThresholdMs = 86_400_000

    expect(predictions.has(staleId)).toBe(true); // not yet swept

    jest.advanceTimersByTime(3_600_000);

    expect(predictions.has(staleId)).toBe(false); // swept after 1 hour
  });

  test('stopCleanupSweep after start prevents further sweep executions', () => {
    const now = Date.now();
    const staleId = 'stale-stop-test';
    predictions.set(staleId, {
      id: staleId,
      guildId: 'g',
      channelId: 'c',
      messageId: 'm',
      creatorId: 'u',
      description: 'test',
      answers: ['A', 'B'],
      status: 'ACTIVE',
      correctAnswerIndex: null,
      cancellationReason: null,
      timeoutMinutes: 5,
      createdAt: now - 2000, // older than 1 ms threshold
      votes: new Map(),
    });

    startCleanupSweep(1000, 1); // sweep every 1000 ms, age threshold = 1 ms
    stopCleanupSweep();

    jest.advanceTimersByTime(5000);

    // Sweep should NOT have fired — prediction still present
    expect(predictions.has(staleId)).toBe(true);
  });

  test('stopCleanupSweep before start does not throw', () => {
    expect(() => stopCleanupSweep()).not.toThrow();
  });

  test('calling startCleanupSweep twice replaces the previous interval without leaking', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const now = Date.now();
    const staleId = 'stale-double-start-test';
    predictions.set(staleId, {
      id: staleId,
      guildId: 'g',
      channelId: 'c',
      messageId: 'm',
      creatorId: 'u',
      description: 'test',
      answers: ['A', 'B'],
      status: 'ACTIVE',
      correctAnswerIndex: null,
      cancellationReason: null,
      timeoutMinutes: 5,
      createdAt: now - 2000, // older than 1 ms threshold
      votes: new Map(),
    });

    startCleanupSweep(1000, 1); // first call
    startCleanupSweep(1000, 1); // second call — should replace the first

    jest.advanceTimersByTime(1000);

    // Sweep should have fired exactly once (not twice)
    expect(consoleSpy).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});

// Feature: prediction-memory-cleanup, Property 7: Map invariant after mixed operations
// Validates: Requirements 4.3
test.prop([
  fc.array(
    fc.record({
      id: fc.uuid(),
      status: fc.constantFrom('ACTIVE', 'LOCKED'),
    }),
    { minLength: 1, maxLength: 10 }
  ),
  fc.array(
    fc.oneof(
      fc.record({ type: fc.constant('finalize'), id: fc.uuid() }),
      fc.record({ type: fc.constant('cancel'), id: fc.uuid() }),
      fc.record({ type: fc.constant('sweep'), ageThresholdMs: fc.constant(Number.MAX_SAFE_INTEGER) })
    ),
    { minLength: 0, maxLength: 20 }
  ),
])(
  'Map contains only non-terminal predictions after any sequence of finalize/cancel/sweep operations',
  async (initialPredictions, operations) => {
    predictions.clear();

    const now = Date.now();

    // Populate the Map with fresh predictions (non-terminal statuses)
    const seenIds = new Set();
    for (const { id, status } of initialPredictions) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      predictions.set(id, {
        id,
        guildId: 'g',
        channelId: 'c',
        messageId: 'm',
        creatorId: 'u',
        description: 'test',
        answers: ['A', 'B'],
        status,
        correctAnswerIndex: null,
        cancellationReason: null,
        timeoutMinutes: 5,
        createdAt: now, // fresh — not stale
        votes: new Map(),
      });
    }

    // Apply each operation in sequence
    for (const op of operations) {
      if (op.type === 'finalize') {
        await finalizePrediction(op.id, 0);
      } else if (op.type === 'cancel') {
        await cancelPrediction(op.id, null);
      } else {
        // sweep with MAX_SAFE_INTEGER threshold — nothing is stale, so only terminal evictions matter
        _runSweep(op.ageThresholdMs);
      }
    }

    // Invariant: Map must contain only non-terminal predictions
    for (const [, prediction] of predictions) {
      expect(prediction.status).not.toBe('FINALIZED');
      expect(prediction.status).not.toBe('CANCELLED');
    }
  }
);
