import { jest, test, expect, beforeAll } from '@jest/globals';
import { MessageFlags } from 'discord.js';

jest.unstable_mockModule('../../services/predictionService.js', () => ({
  getPrediction: jest.fn(() => ({
    id: 'pred-1',
    creatorId: 'creator-123',
    answers: ['Yes', 'No'],
    status: 'ACTIVE',
  })),
  castVote: jest.fn(),
  lockPrediction: jest.fn().mockResolvedValue(undefined),
  cancelPrediction: jest.fn().mockResolvedValue(undefined),
  finalizePrediction: jest.fn().mockResolvedValue(undefined),
}));

let handleButton;

beforeAll(async () => {
  const mod = await import('../../handlers/button.js');
  handleButton = mod.handleButton;
});

function makeInteraction(customId) {
  return {
    customId,
    user: { id: 'other-user-456', username: 'OtherUser' },
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockResolvedValue(undefined),
  };
}

// Requirements: 8.1
test('non-creator clicking lock gets ephemeral creator-only message', async () => {
  const interaction = makeInteraction('lock:pred-1');
  await handleButton(interaction);
  expect(interaction.followUp).toHaveBeenCalledWith({
    content: 'Only the prediction creator can do that.',
    flags: MessageFlags.Ephemeral,
  });
});

// Requirements: 8.3
test('non-creator clicking cancel gets ephemeral creator-only message', async () => {
  const interaction = makeInteraction('cancel:pred-1');
  await handleButton(interaction);
  expect(interaction.reply).toHaveBeenCalledWith({
    content: 'Only the prediction creator can do that.',
    flags: MessageFlags.Ephemeral,
  });
});

// Requirements: 8.2
test('non-creator clicking finalize gets ephemeral creator-only message', async () => {
  const interaction = makeInteraction('finalize:pred-1');
  await handleButton(interaction);
  expect(interaction.followUp).toHaveBeenCalledWith({
    content: 'Only the prediction creator can do that.',
    flags: MessageFlags.Ephemeral,
  });
});
