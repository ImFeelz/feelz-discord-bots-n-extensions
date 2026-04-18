# Discord Prediction Bot

A Discord bot for running live prediction/betting events during gaming sessions. Friends can create predictions (e.g. "Steven will get 5 kills this game"), vote on the outcome, and when the result is in — the bot tags all the losers so they know it's time to pay up.

Multiple predictions can run simultaneously in the same channel. State is held in memory only and does not survive a bot restart.

---

## What You'll Need

- **[Node.js 20 LTS](https://nodejs.org/)** — the runtime. Download the LTS installer from nodejs.org. npm is included.
- **A Discord account** and a server where you have admin permissions.
- **A Discord application + bot token** — created via the [Discord Developer Portal](https://discord.com/developers/applications).

---

## Setting Up a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Give it a name, then go to the **Bot** tab and click **Add Bot**.
3. Under **Token**, click **Reset Token** and copy it — this is your `DISCORD_TOKEN`.
4. On the **OAuth2 → General** tab, copy the **Client ID** — this is your `CLIENT_ID`.
5. Enable these **Privileged Gateway Intents** on the Bot tab:
   - Message Content Intent
6. Go to **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes, then select these bot permissions:
   - Send Messages
   - Use Slash Commands
   - Read Message History
7. Copy the generated URL, open it in your browser, and invite the bot to your server.
8. In Discord, right-click your server name → **Copy Server ID** — this is your `GUILD_ID`. (You'll need Developer Mode enabled: User Settings → Advanced → Developer Mode.)

---

## Installation

```bash
# Clone the repo
git clone <repo-url>
cd discord-prediction-bot

# Install dependencies
npm install
```

---

## Configuration

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_application_client_id_here
GUILD_ID=your_guild_id_here
```

---

## Registering the Slash Command

Before the bot can respond to `/predict`, you need to register the command with Discord once:

```bash
node src/deploy-commands.js
```

You only need to re-run this if you change the command definition.

---

## Running the Bot

```bash
npm start
```

You should see `Logged in as <BotName>#0000!` in the console. The bot is now live in your server.

---

## How to Use It

1. In any channel the bot has access to, type `/predict`.
2. Fill in the modal form:
   - **Prediction Description** — what you're predicting (e.g. "Steven gets 5 kills")
   - **Answer 1 & 2** — required answer options
   - **Answer 3–5** — optional additional answers
   - **Lock Timeout (minutes)** — how long until voting auto-locks (e.g. `3`)
3. The bot posts an interactive embed with voting buttons.
4. Anyone in the channel can click a button to vote. They can change their vote any time before it locks.
5. When the timeout expires (or you click **Lock Prediction**), voting closes.
6. Click **Finalize Prediction**, select the correct answer, and the bot announces the losers.

---

## Running Tests

```bash
npm test
```

This runs the full Jest test suite once (no watch mode). Tests use mocked Discord clients — no live bot connection needed.

To run with coverage:

```bash
npx jest --coverage
```

---

## Project Structure

```
src/
  commands/
    predict.js          # /predict slash command — shows the setup modal
  handlers/
    button.js           # Button interaction handler (vote, lock, cancel, finalize)
    modal.js            # Modal submit handler (prediction creation form)
    select.js           # Select menu + cancel modal handler
  services/
    predictionService.js  # Core business logic and in-memory state
    scheduler.js          # Auto-lock timeout management
  ui/
    guiBuilder.js         # Builds Discord embeds and action rows
  utils/
    validators.js         # Input validation functions
  deploy-commands.js      # One-time slash command registration script
  index.js                # Entry point and interaction router
  __tests__/
    unit/                 # Unit and property-based tests
```

---

## Notes

- Prediction state lives in memory. Restarting the bot clears all active predictions.
- The bot uses [discord.js v14](https://discord.js.org/) and Node.js 20 ESM modules.
- Property-based tests use [@fast-check/jest](https://github.com/dubzzz/fast-check) and run 100+ iterations per property.
