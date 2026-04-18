# Implementation Plan: Discord Prediction Bot

## Overview

Implement a Discord bot in Node.js 20 (ESM) using discord.js v14 that supports live prediction/betting events. State is held in-memory only. The implementation follows the layered architecture defined in the design: validators → data model → scheduler → GUI builder → prediction service → interaction handlers → router.

## Tasks

- [x] 1. Project setup and bot registration
  - Create `package.json` with `"type": "module"`, scripts (`start`, `test`), and dependencies: `discord.js`, `uuid`; devDependencies: `jest`, `@fast-check/jest`
  - Add `jest.config.js` configured for ESM (`transform: {}`, `testEnvironment: "node"`)
  - Create `src/` directory structure: `commands/`, `handlers/`, `services/`, `ui/`, `utils/`, `__tests__/unit/`
  - Create `.env.example` with `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` placeholders
  - Create `src/deploy-commands.js` that registers the `/predict` slash command definition with the Discord REST API
  - _Requirements: 1.1_

- [x] 2. Validators and answer collection utilities
  - [x] 2.1 Implement `src/utils/validators.js` with `validateDescription`, `validateAnswer`, `validateTimeout`, and `collectAnswers`
    - `validateDescription(value)` → `{ valid: true }` or `{ valid: false, error: string }` for 1–200 chars
    - `validateAnswer(value)` → valid for 1–50 chars (only called on non-empty slots)
    - `validateTimeout(value)` → valid only for positive integer strings (≥ 1)
    - `collectAnswers(slots)` → filters empty strings, returns ordered array of non-empty values
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x]* 2.2 Write property test for `validateDescription` (Property 1)
    - **Property 1: Description validation accepts exactly the valid length range**
    - **Validates: Requirements 1.2**
    - File: `src/__tests__/unit/validators.test.js`

  - [x]* 2.3 Write property test for `validateAnswer` (Property 2)
    - **Property 2: Answer validation accepts exactly the valid length range**
    - **Validates: Requirements 1.5**
    - File: `src/__tests__/unit/validators.test.js`

  - [x]* 2.4 Write property test for `validateTimeout` (Property 3)
    - **Property 3: Timeout validation accepts only positive integers**
    - **Validates: Requirements 1.6**
    - File: `src/__tests__/unit/validators.test.js`

  - [x]* 2.5 Write property test for `collectAnswers` (Property 4)
    - **Property 4: Answer slot collection preserves order and filters empties**
    - **Validates: Requirements 1.4**
    - File: `src/__tests__/unit/validators.test.js`

- [x] 3. Core data model and in-memory store
  - [x] 3.1 Implement the in-memory prediction store in `src/services/predictionService.js`
    - Declare module-level `const predictions = new Map()` (predictionId → Prediction object)
    - Define the Prediction object shape per the design data model (id, guildId, channelId, messageId, creatorId, description, answers, status, correctAnswerIndex, cancellationReason, timeoutMinutes, createdAt, votes as `Map<userId, answerIndex>`)
    - Export a `getPrediction(predictionId)` helper used by all handlers
    - _Requirements: 1.8, 1.9_

- [x] 4. Scheduler (`src/services/scheduler.js`)
  - [x] 4.1 Implement `schedule(predictionId, delayMs, callback)`, `cancel(predictionId)`, and `getRemainingMs(predictionId)`
    - Store `{ handle, startedAt, delayMs }` in a module-level `Map`
    - `getRemainingMs` computes `delayMs - (Date.now() - startedAt)`, clamped to 0
    - _Requirements: 4.1, 4.4_

  - [x]* 4.2 Write unit tests for scheduler with fake timers
    - Use `jest.useFakeTimers()` to verify `schedule` fires callback after delay and `cancel` prevents it
    - File: `src/__tests__/unit/scheduler.test.js`
    - _Requirements: 4.1, 4.4_

- [x] 5. GUI Builder (`src/ui/guiBuilder.js`)
  - [x] 5.1 Implement `buildPredictionEmbed(prediction)`
    - ACTIVE: show description, per-answer vote tallies with voter usernames, remaining time
    - LOCKED: same as active but with a "🔒 Locked — voting closed" indicator; no remaining time
    - FINALIZED: show correct answer highlighted, final vote breakdown per answer
    - CANCELLED: show "❌ Cancelled" indicator and cancellation reason if present
    - _Requirements: 2.1, 2.2, 2.4, 4.3, 5.4, 6.4, 7.6_

  - [x] 5.2 Implement `buildActionRows(prediction)`
    - ACTIVE: answer buttons row(s) (one button per answer, `customId: vote:<id>:<index>`) + `[Lock | Cancel]` row
    - LOCKED: `[Finalize | Cancel]` row only
    - FINALIZED / CANCELLED: return `[]`
    - Lock and Cancel buttons use `customId: lock:<id>` / `cancel:<id>`; Finalize uses `finalize:<id>`
    - _Requirements: 2.3, 2.4, 5.3, 6.1, 7.1_

  - [x] 5.3 Implement `buildLoserMessage(prediction, loserIds)`
    - Returns `"Here are your losers for [description]! Time to pay up! <@id1> <@id2> ..."`
    - Returns everyone-correct message when `loserIds` is empty
    - _Requirements: 7.4, 7.5_

  - [x]* 5.4 Write property test for `buildPredictionEmbed` — active embed completeness (Property 13)
    - **Property 13: Active prediction embed contains all required fields**
    - **Validates: Requirements 2.1, 2.2**
    - File: `src/__tests__/unit/guiBuilder.test.js`

  - [x]* 5.5 Write property test for `buildPredictionEmbed` — finalized embed completeness (Property 12)
    - **Property 12: Finalized embed shows correct answer and all votes**
    - **Validates: Requirements 7.6**
    - File: `src/__tests__/unit/guiBuilder.test.js`

  - [x]* 5.6 Write property test for `buildPredictionEmbed` — cancelled embed shows reason (Property 15)
    - **Property 15: Cancelled embed shows reason when provided**
    - **Validates: Requirements 6.4**
    - File: `src/__tests__/unit/guiBuilder.test.js`

  - [x]* 5.7 Write property test for `buildActionRows` — answer button count (Property 14)
    - **Property 14: Action rows contain exactly one button per answer (active state)**
    - **Validates: Requirements 2.4**
    - File: `src/__tests__/unit/guiBuilder.test.js`

  - [x]* 5.8 Write property test for `buildLoserMessage` — mentions every loser (Property 11)
    - **Property 11: Loser announcement mentions every loser**
    - **Validates: Requirements 7.4**
    - File: `src/__tests__/unit/guiBuilder.test.js`

- [x] 6. Prediction Service — business logic
  - [x] 6.1 Implement `createPrediction(interaction, { description, answers, timeoutMinutes })`
    - Generate UUID v4 id, build Prediction object, store in `predictions` Map
    - Post GUI message via `interaction.reply({ embeds, components })`, store returned `messageId`
    - Call `scheduler.schedule(id, timeoutMinutes * 60_000, () => lockPrediction(id, 'timeout'))`
    - _Requirements: 1.8, 1.9, 4.1_

  - [x]* 6.2 Write property test for prediction creation field mapping (Property 5)
    - **Property 5: Prediction creation stores all fields correctly**
    - **Validates: Requirements 1.8**
    - Mock `interaction.reply` and `scheduler.schedule`; assert stored Prediction fields match inputs
    - File: `src/__tests__/unit/predictionService.test.js`

  - [x] 6.3 Implement `castVote(predictionId, userId, username, answerIndex)`
    - Return `{ ok: false, error: 'not_found' }` if prediction missing
    - Return `{ ok: false, error: 'not_active' }` if status is not ACTIVE
    - Set `prediction.votes.set(userId, answerIndex)` (replaces any existing vote)
    - Refresh GUI via `updateGui(prediction)`
    - Return `{ ok: true }`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.2_

  - [x]* 6.4 Write property test for vote casting (Property 6)
    - **Property 6: Vote casting records the correct answer**
    - **Validates: Requirements 3.1, 3.3**
    - File: `src/__tests__/unit/predictionService.test.js`

  - [x]* 6.5 Write property test for vote changing (Property 8)
    - **Property 8: Vote changing replaces the previous vote**
    - **Validates: Requirements 3.2, 3.3**
    - File: `src/__tests__/unit/predictionService.test.js`

  - [x]* 6.6 Write property test for locked prediction rejecting votes (Property 9)
    - **Property 9: Locked predictions reject all vote attempts**
    - **Validates: Requirements 5.2**
    - File: `src/__tests__/unit/predictionService.test.js`

  - [x] 6.7 Implement `lockPrediction(predictionId, reason)` (`reason: 'manual' | 'timeout'`)
    - Set `status = 'LOCKED'`; if `reason === 'manual'` call `scheduler.cancel(predictionId)`
    - Refresh GUI; if `reason === 'timeout'` add timeout-expired indicator to embed
    - _Requirements: 4.2, 4.3, 4.4, 5.1, 5.3, 5.4_

  - [x] 6.8 Implement `cancelPrediction(predictionId, cancellationReason)`
    - Set `status = 'CANCELLED'`, store `cancellationReason`
    - Call `scheduler.cancel(predictionId)`; refresh GUI
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 6.9 Implement `finalizePrediction(predictionId, correctAnswerIndex)`
    - Set `status = 'FINALIZED'`, store `correctAnswerIndex`
    - Compute losers: users in `votes` whose value ≠ `correctAnswerIndex`
    - Refresh GUI; post loser announcement via `channel.send(buildLoserMessage(prediction, loserIds))`
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x]* 6.10 Write property test for loser identification (Property 10)
    - **Property 10: Loser identification is correct for all vote distributions**
    - **Validates: Requirements 7.3**
    - File: `src/__tests__/unit/predictionService.test.js`

  - [x] 6.11 Implement private `updateGui(prediction)` helper
    - Fetch the channel via `client.channels.fetch(prediction.channelId)`
    - Edit the message via `channel.messages.fetch(prediction.messageId)` then `message.edit({ embeds, components })`
    - Catch and log Discord API errors without throwing (prediction state remains valid)
    - _Requirements: 2.5_

- [x] 7. Checkpoint — core logic complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Command Handler (`src/commands/predict.js`)
  - Implement `execute(interaction)` that calls `interaction.showModal(modal)` with a `ModalBuilder` containing:
    - `predictionDescription` (required, short text)
    - `answer1`, `answer2` (required, short text)
    - `answer3`, `answer4`, `answer5` (optional, short text)
    - `lockTimeout` (required, short text, placeholder "3")
  - Modal `customId`: `predict_modal`
  - _Requirements: 1.1_

- [x] 9. Modal Handler (`src/handlers/modal.js`)
  - Implement `handlePredictModal(interaction)`
    - Extract all 7 fields from `interaction.fields`
    - Run validators; on any failure reply ephemerally with the error message
    - Call `collectAnswers([answer1..5])` and validate at least 2 answers present
    - On success call `predictionService.createPrediction(interaction, { description, answers, timeoutMinutes })`
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [ ] 10. Button Handler (`src/handlers/button.js`)
  - [x] 10.1 Implement `handleButton(interaction)` with `customId` parsing (`action:predictionId[:extra]`)
    - Call `interaction.deferUpdate()` immediately for all button interactions
    - Look up prediction; reply ephemerally with "This prediction is no longer available." if not found
    - Dispatch to: `handleVote`, `handleLock`, `handleCancel`, `handleFinalize`
    - _Requirements: 3.1, 5.1, 6.2, 7.1_

  - [x] 10.2 Implement `handleVote(interaction, predictionId, answerIndex)`
    - Call `predictionService.castVote(predictionId, userId, username, answerIndex)`
    - On `not_active` error reply ephemerally: "Voting is closed for this prediction."
    - _Requirements: 3.1, 3.2, 5.2_

  - [x] 10.3 Implement `handleLock(interaction, predictionId)` with creator-only guard
    - If `interaction.user.id !== prediction.creatorId` reply ephemerally: "Only the prediction creator can do that."
    - Otherwise call `predictionService.lockPrediction(predictionId, 'manual')`
    - _Requirements: 5.1, 8.1_

  - [x] 10.4 Implement `handleCancel(interaction, predictionId)` with creator-only guard
    - Show a modal (`cancel_modal:<predictionId>`) with an optional cancellation reason text field
    - Guard: non-creator gets ephemeral error
    - _Requirements: 6.2, 8.3_

  - [x] 10.5 Implement `handleFinalize(interaction, predictionId)` with creator-only guard
    - Reply with a `StringSelectMenuBuilder` (`customId: finalize_answer:<predictionId>`) listing all answers
    - Guard: non-creator gets ephemeral error
    - _Requirements: 7.1, 8.2_

  - [x]* 10.6 Write unit tests for creator-only guards
    - Test that non-creator button clicks for lock, cancel, finalize each return the correct ephemeral error
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 11. Select Handler (`src/handlers/select.js`)
  - Implement `handleSelect(interaction)` dispatching on `customId` prefix
  - `finalize_answer:<predictionId>`: call `predictionService.finalizePrediction(predictionId, selectedIndex)`
  - `cancel_modal:<predictionId>` (modal submit): call `predictionService.cancelPrediction(predictionId, reason)`
  - _Requirements: 7.2, 6.3_

- [x] 12. Interaction Router (`src/index.js`)
  - Create `discord.js` `Client` with required intents (`Guilds`, `GuildMessages`)
  - Register `interactionCreate` handler dispatching to `handleCommand`, `handleButton`, `handleModal`, `handleSelect`
  - Register `ready` handler that logs bot username on startup
  - Load `DISCORD_TOKEN` from environment and call `client.login(token)`
  - _Requirements: 1.1, 2.5_

- [x] 13. Final checkpoint — wire-up and integration
  - Ensure all tests pass, ask the user if questions arise.
  - Verify `src/deploy-commands.js` correctly registers `/predict` with the Discord API
  - Confirm `src/index.js` starts without errors when `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID` are set

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `test.prop` from `@fast-check/jest` and run ≥ 100 iterations each
- Unit tests mock the Discord client; no live Discord connection is needed to run the test suite
- Run tests with `npx jest --runInBand` (single execution, no watch mode)
