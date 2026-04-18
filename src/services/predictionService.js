import { v4 as uuidv4 } from 'uuid';
import { buildPredictionEmbed, buildActionRows, buildLoserMessage } from '../ui/guiBuilder.js';
import * as scheduler from './scheduler.js';

/**
 * @typedef {Object} Prediction
 * @property {string} id - UUID v4
 * @property {string} guildId - Discord guild (server) ID
 * @property {string} channelId - Discord channel ID
 * @property {string} messageId - ID of the posted GUI message
 * @property {string} creatorId - Discord user ID of the creator
 * @property {string} description - Prediction description (1–200 chars)
 * @property {string[]} answers - Ordered list of 2–5 answer strings
 * @property {'ACTIVE' | 'LOCKED' | 'FINALIZED' | 'CANCELLED'} status
 * @property {number | null} correctAnswerIndex - Set on finalization
 * @property {string | null} cancellationReason - Set on cancellation
 * @property {number} timeoutMinutes - Creator-specified lock timeout
 * @property {number} createdAt - Unix timestamp (ms) of creation
 * @property {Map<string, number>} votes - userId → answerIndex
 */

/** @type {Map<string, Prediction>} */
const predictions = new Map();

/** @type {import('discord.js').Client | null} */
let client = null;

/**
 * Injects the discord.js Client so the service can fetch channels.
 * @param {import('discord.js').Client} c
 */
export function setClient(c) {
  client = c;
}

/**
 * Returns the prediction with the given ID, or null if not found.
 * @param {string} predictionId
 * @returns {Prediction | null}
 */
export function getPrediction(predictionId) {
  return predictions.get(predictionId) ?? null;
}

/**
 * Creates a new prediction, posts the GUI message, and schedules the auto-lock.
 * @param {import('discord.js').Interaction} interaction
 * @param {{ description: string, answers: string[], timeoutMinutes: number }} options
 * @returns {Promise<Prediction>}
 */
export async function createPrediction(interaction, { description, answers, timeoutMinutes }) {
  const id = uuidv4();

  const prediction = {
    id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    creatorId: interaction.user.id,
    description,
    answers,
    timeoutMinutes,
    status: 'ACTIVE',
    correctAnswerIndex: null,
    cancellationReason: null,
    createdAt: Date.now(),
    votes: new Map(),
    messageId: '',
  };

  predictions.set(id, prediction);

  const message = await interaction.reply({
    embeds: [buildPredictionEmbed(prediction)],
    components: buildActionRows(prediction),
    fetchReply: true,
  });

  prediction.messageId = message.id;

  scheduler.schedule(id, timeoutMinutes * 60_000, () => lockPrediction(id, 'timeout'));

  return prediction;
}

/**
 * Casts or replaces a vote for a user on an active prediction.
 * @param {string} predictionId
 * @param {string} userId
 * @param {string} username - Accepted for API compatibility but not stored
 * @param {number} answerIndex
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function castVote(predictionId, userId, username, answerIndex) {
  const prediction = predictions.get(predictionId);

  if (!prediction) {
    return { ok: false, error: 'not_found' };
  }

  if (prediction.status !== 'ACTIVE') {
    return { ok: false, error: 'not_active' };
  }

  prediction.votes.set(userId, answerIndex);

  await updateGui(prediction);

  return { ok: true };
}

/**
 * Locks a prediction, optionally cancelling the auto-lock timer.
 * @param {string} predictionId
 * @param {'manual' | 'timeout'} reason
 * @returns {Promise<void>}
 */
export async function lockPrediction(predictionId, reason) {
  const prediction = predictions.get(predictionId);
  if (!prediction) return;

  prediction.status = 'LOCKED';

  if (reason === 'manual') {
    scheduler.cancel(predictionId);
  }

  if (reason === 'timeout') {
    prediction.timedOut = true;
  }

  await updateGui(prediction);
}

/**
 * Cancels a prediction, storing an optional cancellation reason.
 * @param {string} predictionId
 * @param {string | null} cancellationReason
 * @returns {Promise<void>}
 */
export async function cancelPrediction(predictionId, cancellationReason) {
  const prediction = predictions.get(predictionId);
  if (!prediction) return;

  prediction.status = 'CANCELLED';
  prediction.cancellationReason = cancellationReason;

  scheduler.cancel(predictionId);

  await updateGui(prediction);
}

/**
 * Finalizes a prediction, identifies losers, refreshes the GUI, and posts the loser announcement.
 * @param {string} predictionId
 * @param {number} correctAnswerIndex
 * @returns {Promise<void>}
 */
export async function finalizePrediction(predictionId, correctAnswerIndex) {
  const prediction = predictions.get(predictionId);
  if (!prediction) return;

  prediction.status = 'FINALIZED';
  prediction.correctAnswerIndex = correctAnswerIndex;

  const loserIds = [];
  for (const [userId, answerIndex] of prediction.votes) {
    if (answerIndex !== correctAnswerIndex) {
      loserIds.push(userId);
    }
  }

  await updateGui(prediction);

  const channel = await client.channels.fetch(prediction.channelId);
  await channel.send(buildLoserMessage(prediction, loserIds));
}

/**
 * Fetches the Discord message for a prediction and edits it with the latest embed and action rows.
 * Errors (e.g. message deleted, Discord API failures) are caught and logged; they do not affect
 * the in-memory prediction state.
 * @param {Prediction} prediction
 * @returns {Promise<void>}
 */
async function updateGui(prediction) {
  try {
    const channel = await client.channels.fetch(prediction.channelId);
    const message = await channel.messages.fetch(prediction.messageId);
    await message.edit({
      embeds: [buildPredictionEmbed(prediction)],
      components: buildActionRows(prediction),
    });
  } catch (err) {
    console.error('updateGui failed for prediction', prediction.id, err);
  }
}

export { predictions };
