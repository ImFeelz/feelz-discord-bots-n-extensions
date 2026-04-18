import { finalizePrediction, cancelPrediction } from '../services/predictionService.js';

/**
 * Routes a StringSelectMenu or ModalSubmit interaction to the appropriate handler.
 * customId formats:
 *   - "finalize_answer:<predictionId>"  (StringSelectMenuInteraction)
 *   - "cancel_modal:<predictionId>"     (ModalSubmitInteraction)
 * @param {import('discord.js').StringSelectMenuInteraction | import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handleSelect(interaction) {
  const [prefix, predictionId] = interaction.customId.split(':');

  await interaction.deferUpdate();

  if (prefix === 'finalize_answer') {
    const selectedIndex = parseInt(interaction.values[0], 10);
    await finalizePrediction(predictionId, selectedIndex);
    return;
  }

  if (prefix === 'cancel_modal') {
    const reason = interaction.fields.getTextInputValue('cancellationReason');
    await cancelPrediction(predictionId, reason);
    return;
  }
}
