import {
  SlashCommandBuilder,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('predict')
  .setDescription('Start a new prediction event');

export async function execute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('predict_modal')
    .setTitle('Create a Prediction');

  const descriptionInput = new TextInputBuilder()
    .setCustomId('predictionDescription')
    .setLabel('Prediction Description')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200);

  const answer1Input = new TextInputBuilder()
    .setCustomId('answer1')
    .setLabel('Answer 1')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);

  const answer2Input = new TextInputBuilder()
    .setCustomId('answer2')
    .setLabel('Answer 2')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);

  const answer3Input = new TextInputBuilder()
    .setCustomId('answer3')
    .setLabel('Answer 3 (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(50);

  const answer4Input = new TextInputBuilder()
    .setCustomId('answer4')
    .setLabel('Answer 4 (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(50);

  const answer5Input = new TextInputBuilder()
    .setCustomId('answer5')
    .setLabel('Answer 5 (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(50);

  const lockTimeoutInput = new TextInputBuilder()
    .setCustomId('lockTimeout')
    .setLabel('Lock Timeout (minutes)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('3')
    .setMaxLength(10);

  modal.addComponents(
    new ActionRowBuilder().addComponents(descriptionInput),
    new ActionRowBuilder().addComponents(answer1Input),
    new ActionRowBuilder().addComponents(answer2Input),
    new ActionRowBuilder().addComponents(answer3Input),
    new ActionRowBuilder().addComponents(answer4Input),
    new ActionRowBuilder().addComponents(answer5Input),
    new ActionRowBuilder().addComponents(lockTimeoutInput),
  );

  await interaction.showModal(modal);
}
