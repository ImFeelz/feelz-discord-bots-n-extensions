import {
  MessageFlags,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import {
  getPrediction,
  castVote,
  lockPrediction,
  cancelPrediction,
  finalizePrediction,
} from '../services/predictionService.js';

/**
 * Routes a button interaction to the appropriate handler.
 * customId format: "<action>:<predictionId>[:<extra>]"
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleButton(interaction) {
  const [action, predictionId, extra] = interaction.customId.split(':');

  // Cancel needs to show a modal — cannot deferUpdate first
  if (action === 'cancel') {
    return handleCancel(interaction, predictionId);
  }

  await interaction.deferUpdate();

  const prediction = getPrediction(predictionId);
  if (!prediction) {
    return interaction.followUp({
      content: 'This prediction is no longer available.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'vote') {
    return handleVote(interaction, predictionId, parseInt(extra, 10));
  }
  if (action === 'lock') {
    return handleLock(interaction, predictionId, prediction);
  }
  if (action === 'finalize') {
    return handleFinalize(interaction, predictionId, prediction);
  }
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} predictionId
 * @param {number} answerIndex
 */
async function handleVote(interaction, predictionId, answerIndex) {
  const { user } = interaction;
  const result = await castVote(predictionId, user.id, user.username, answerIndex);

  if (!result.ok && result.error === 'not_active') {
    return interaction.followUp({
      content: 'Voting is closed for this prediction.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} predictionId
 * @param {import('../services/predictionService.js').Prediction} prediction
 */
async function handleLock(interaction, predictionId, prediction) {
  if (interaction.user.id !== prediction.creatorId) {
    return interaction.followUp({
      content: 'Only the prediction creator can do that.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await lockPrediction(predictionId, 'manual');
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} predictionId
 */
async function handleCancel(interaction, predictionId) {
  const prediction = getPrediction(predictionId);
  if (!prediction) {
    return interaction.reply({
      content: 'This prediction is no longer available.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.user.id !== prediction.creatorId) {
    return interaction.reply({
      content: 'Only the prediction creator can do that.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`cancel_modal:${predictionId}`)
    .setTitle('Cancel Prediction');

  const reasonInput = new TextInputBuilder()
    .setCustomId('cancellationReason')
    .setLabel('Cancellation reason (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

  await interaction.showModal(modal);
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} predictionId
 * @param {import('../services/predictionService.js').Prediction} prediction
 */
async function handleFinalize(interaction, predictionId, prediction) {
  if (interaction.user.id !== prediction.creatorId) {
    return interaction.followUp({
      content: 'Only the prediction creator can do that.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`finalize_answer:${predictionId}`)
    .setPlaceholder('Select the correct answer')
    .addOptions(
      prediction.answers.map((answer, index) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(answer)
          .setValue(String(index))
      )
    );

  await interaction.followUp({
    components: [new ActionRowBuilder().addComponents(selectMenu)],
    flags: MessageFlags.Ephemeral,
  });
}
