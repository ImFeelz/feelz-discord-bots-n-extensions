import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getRemainingMs } from '../services/scheduler.js';

/**
 * Builds a reverse map from answerIndex → [userId mentions] from the votes Map.
 * @param {Map<string, number>} votes - userId → answerIndex
 * @param {number} answerCount
 * @returns {Map<number, string[]>}
 */
function buildVotersByAnswer(votes, answerCount) {
  const map = new Map();
  for (let i = 0; i < answerCount; i++) map.set(i, []);
  for (const [userId, answerIndex] of votes) {
    if (map.has(answerIndex)) {
      map.get(answerIndex).push(`<@${userId}>`);
    }
  }
  return map;
}

/**
 * Builds a Discord EmbedBuilder for a given prediction.
 * @param {object} prediction
 * @returns {EmbedBuilder}
 */
export function buildPredictionEmbed(prediction) {
  const { description, answers, status, votes, correctAnswerIndex, cancellationReason } = prediction;

  const embed = new EmbedBuilder();

  if (status === 'ACTIVE') {
    const votersByAnswer = buildVotersByAnswer(votes, answers.length);
    const remainingMs = getRemainingMs(prediction.id);
    const remainingMinutes = Math.ceil(remainingMs / 60_000);

    embed
      .setTitle(description)
      .setColor(0x5865F2)
      .setFooter({ text: `⏱ Closes in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}` });

    for (let i = 0; i < answers.length; i++) {
      const voters = votersByAnswer.get(i) ?? [];
      const voterList = voters.length > 0 ? voters.join(' ') : '_No votes yet_';
      embed.addFields({
        name: `${answers[i]} (${voters.length} vote${voters.length !== 1 ? 's' : ''})`,
        value: voterList,
      });
    }

  } else if (status === 'LOCKED') {
    const votersByAnswer = buildVotersByAnswer(votes, answers.length);

    embed
      .setTitle(`${description} — 🔒 Locked — voting closed`)
      .setColor(0xFFA500)
      .setFooter({ text: '🔒 Voting is closed' });

    for (let i = 0; i < answers.length; i++) {
      const voters = votersByAnswer.get(i) ?? [];
      const voterList = voters.length > 0 ? voters.join(' ') : '_No votes yet_';
      embed.addFields({
        name: `${answers[i]} (${voters.length} vote${voters.length !== 1 ? 's' : ''})`,
        value: voterList,
      });
    }

  } else if (status === 'FINALIZED') {
    const votersByAnswer = buildVotersByAnswer(votes, answers.length);

    embed
      .setTitle(`${description} — Finalized`)
      .setColor(0x57F287);

    for (let i = 0; i < answers.length; i++) {
      const voters = votersByAnswer.get(i) ?? [];
      const voterList = voters.length > 0 ? voters.join(' ') : '_No votes_';
      const isCorrect = i === correctAnswerIndex;
      embed.addFields({
        name: `${isCorrect ? '✅ ' : ''}${answers[i]} (${voters.length} vote${voters.length !== 1 ? 's' : ''})`,
        value: voterList,
      });
    }

  } else if (status === 'CANCELLED') {
    embed
      .setTitle(`${description} — ❌ Cancelled`)
      .setColor(0xED4245);

    if (cancellationReason && cancellationReason.trim().length > 0) {
      embed.addFields({ name: 'Reason', value: cancellationReason });
    }
  }

  return embed;
}

/**
 * Builds Discord ActionRowBuilder[] for a given prediction.
 * @param {object} prediction
 * @returns {ActionRowBuilder[]}
 */
export function buildActionRows(prediction) {
  const { id, answers, status } = prediction;

  if (status === 'ACTIVE') {
    // One button per answer, up to 5 per row
    const answerButtons = answers.map((answer, index) =>
      new ButtonBuilder()
        .setCustomId(`vote:${id}:${index}`)
        .setLabel(answer)
        .setStyle(ButtonStyle.Primary)
    );

    const rows = [];
    for (let i = 0; i < answerButtons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(answerButtons.slice(i, i + 5)));
    }

    // Control row: Lock + Cancel
    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`lock:${id}`)
        .setLabel('🔒 Lock Prediction')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`cancel:${id}`)
        .setLabel('❌ Cancel Prediction')
        .setStyle(ButtonStyle.Danger)
    );
    rows.push(controlRow);

    return rows;
  }

  if (status === 'LOCKED') {
    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`finalize:${id}`)
        .setLabel('✅ Finalize Prediction')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`cancel:${id}`)
        .setLabel('❌ Cancel Prediction')
        .setStyle(ButtonStyle.Danger)
    );
    return [controlRow];
  }

  // FINALIZED or CANCELLED
  return [];
}

/**
 * Builds the loser announcement message for a finalized prediction.
 * @param {object} prediction - Prediction object with a `description` field
 * @param {string[]} loserIds - Array of Discord user IDs who lost
 * @returns {string}
 */
export function buildLoserMessage(prediction, loserIds) {
  if (loserIds.length > 0) {
    const mentions = loserIds.map(id => `<@${id}>`).join(' ');
    return `Here are your losers for ${prediction.description}! Time to pay up! ${mentions}`;
  }
  return `Everyone predicted correctly for '${prediction.description}'! Well done!`;
}
