import { Client, GatewayIntentBits, Events } from 'discord.js';
import { handleButton } from './handlers/button.js';
import { handlePredictModal } from './handlers/modal.js';
import { handleSelect } from './handlers/select.js';
import { execute } from './commands/predict.js';
import { setClient } from './services/predictionService.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      return await execute(interaction);
    }

    if (interaction.isButton()) {
      return await handleButton(interaction);
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('predict_modal')) {
        return await handlePredictModal(interaction);
      }
      if (interaction.customId.startsWith('cancel_modal')) {
        return await handleSelect(interaction);
      }
    }

    if (interaction.isStringSelectMenu()) {
      return await handleSelect(interaction);
    }
  } catch (err) {
    console.error('Error handling interaction:', err);
  }
});

const token = process.env.DISCORD_TOKEN;
setClient(client);
client.login(token);
