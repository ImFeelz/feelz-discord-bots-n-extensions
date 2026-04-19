import { MessageFlags } from 'discord.js';
import {
  validateDescription,
  validateAnswer,
  validateTimeout,
  collectAnswers,
} from '../utils/validators.js';
import * as predictionService from '../services/predictionService.js';

/**
 * Handles the predict_modal submission.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handlePredictModal(interaction) {
  const predictionDescription = interaction.fields.getTextInputValue('predictionDescription');
  const answer1 = interaction.fields.getTextInputValue('answer1');
  const answer2 = interaction.fields.getTextInputValue('answer2');
  const answer3 = interaction.fields.getTextInputValue('answer3');
  const lockTimeout = interaction.fields.getTextInputValue('lockTimeout');

  // Validate description
  const descResult = validateDescription(predictionDescription);
  if (!descResult.valid) {
    return interaction.reply({ content: descResult.error, flags: MessageFlags.Ephemeral });
  }

  // Validate required answers
  if (!answer1 || answer1.trim().length === 0) {
    return interaction.reply({ content: 'Answer 1 is required.', flags: MessageFlags.Ephemeral });
  }
  if (!answer2 || answer2.trim().length === 0) {
    return interaction.reply({ content: 'Answer 2 is required.', flags: MessageFlags.Ephemeral });
  }

  // Validate each non-empty answer slot
  for (const [label, value] of [
    ['Answer 1', answer1],
    ['Answer 2', answer2],
    ['Answer 3', answer3],
  ]) {
    if (value && value.trim().length > 0) {
      const result = validateAnswer(value);
      if (!result.valid) {
        return interaction.reply({ content: `${label}: ${result.error}`, flags: MessageFlags.Ephemeral });
      }
    }
  }

  // Validate timeout
  const timeoutResult = validateTimeout(lockTimeout);
  if (!timeoutResult.valid) {
    return interaction.reply({ content: timeoutResult.error, flags: MessageFlags.Ephemeral });
  }

  // Collect non-empty answers
  const answers = collectAnswers([answer1, answer2, answer3]);
  if (answers.length < 2) {
    return interaction.reply({
      content: 'At least 2 answers are required.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const timeoutMinutes = parseInt(lockTimeout.trim(), 10);

  await predictionService.createPrediction(interaction, {
    description: predictionDescription,
    answers,
    timeoutMinutes,
  });
}
