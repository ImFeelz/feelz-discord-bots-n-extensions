# Requirements Document

## Introduction

A Discord bot that facilitates fun social prediction/betting events during gaming sessions. Friends can create predictions (e.g. "Steven will get 5 kills this game"), let others vote on the outcome, lock voting when ready, and then reveal the result — tagging the losers with a fun message so they know it's time to pay up. Multiple predictions can be active simultaneously in the same channel. Prediction state is held in memory only; it does not survive a bot restart.

## Glossary

- **Bot**: The Discord bot application that processes commands and manages prediction events.
- **Prediction**: A named event with a question and a set of allowed answers that users vote on.
- **Creator**: The Discord user who initiated a prediction via the slash command.
- **Participant**: Any Discord user who casts a vote on an active prediction.
- **Vote**: A single choice made by a Participant for a given Prediction.
- **Active Prediction**: A Prediction that is open for voting and has not yet been locked, cancelled, or finalized.
- **Locked Prediction**: A Prediction in which voting has been closed; no new votes or changes are accepted.
- **Finalized Prediction**: A Prediction for which the Creator has declared the correct answer.
- **Cancelled Prediction**: A Prediction that the Creator has closed before finalization, with no result declared.
- **Loser**: A Participant whose Vote does not match the correct answer of a Finalized Prediction.
- **Lock Timeout**: The duration set by the Creator at creation time after which the Bot automatically locks the Prediction.
- **GUI**: The interactive Discord message (using embeds and buttons/select menus) presented to users in the channel.
- **Channel**: The Discord text channel in which the prediction was created.
- **Setup Form**: The modal form presented to the Creator when invoking `/predict`, containing fields for the prediction description, up to 5 individual labeled answer slots (Answer 1 through Answer 5), and a lock timeout in minutes.
- **Answer Slot**: A single labeled input field in the Setup Form (e.g. "Answer 1", "Answer 2") that the Creator fills in with one answer option. Empty slots are ignored.


## Requirements

### Requirement 1: Create a Prediction

**User Story:** As a Creator, I want to start a prediction event with a custom description, answer choices, and a lock timeout, so that my friends can vote on the outcome before voting closes automatically.

#### Acceptance Criteria

1. WHEN a user invokes the `/predict` slash command, THE Bot SHALL present the Creator with a Setup Form containing a prediction description field, five individually labeled Answer Slots (Answer 1 through Answer 5), and a lock timeout field in minutes.
2. WHEN the Creator submits the Setup Form, THE Bot SHALL validate that the prediction description is between 1 and 200 characters.
3. WHEN the Creator submits the Setup Form, THE Bot SHALL validate that Answer 1 and Answer 2 are both filled in.
4. WHEN the Creator submits the Setup Form, THE Bot SHALL collect Answer Slots 3 through 5 only when they are non-empty, ignoring any empty slots.
5. WHEN the Creator submits the Setup Form, THE Bot SHALL validate that each filled Answer Slot contains between 1 and 50 characters.
6. WHEN the Creator submits the Setup Form, THE Bot SHALL validate that the lock timeout is a positive integer number of minutes.
7. IF the Creator submits a Setup Form with invalid data, THEN THE Bot SHALL display an inline error message describing the validation failure without creating a Prediction.
8. WHEN a valid Setup Form is submitted, THE Bot SHALL create a Prediction whose allowed answers are the ordered list of filled Answer Slots, with the specified lock timeout (defaulting to 3 minutes if not provided), and post the voting GUI in the Channel.
9. THE Bot SHALL allow multiple Active Predictions to exist simultaneously within the same Channel.

---

### Requirement 2: Display the Voting GUI

**User Story:** As a Participant, I want to see the prediction details and who has voted for what, so that I can make an informed choice.

#### Acceptance Criteria

1. WHEN a Prediction is created, THE Bot SHALL display a GUI embed containing the prediction description, all allowed answers, the current vote tally for each answer, and the remaining time until the Prediction auto-locks.
2. WHEN a Prediction is created, THE Bot SHALL display the Discord username of each Participant next to the answer they voted for.
3. WHILE a Prediction is Active, THE Bot SHALL display a "Lock Prediction" button and a "Cancel Prediction" button visible only to the Creator.
4. WHILE a Prediction is Active, THE Bot SHALL display answer selection buttons for each allowed answer, visible to all users in the Channel.
5. WHILE a Prediction is Active, THE Bot SHALL update the GUI in-place within 2 seconds after any vote is cast or changed.

---

### Requirement 3: Cast and Change a Vote

**User Story:** As a Participant, I want to pick my answer by clicking a button and be able to change it before the prediction is locked, so that I can update my prediction if I change my mind.

#### Acceptance Criteria

1. WHEN a Participant clicks an answer button on an Active Prediction, THE Bot SHALL record that Participant's Vote as the selected answer.
2. WHEN a Participant who has already voted clicks a different answer button on an Active Prediction, THE Bot SHALL replace the Participant's existing Vote with the newly selected answer.
3. THE Bot SHALL enforce that each Participant holds at most one Vote per Prediction at any time.
4. WHEN a Participant casts or changes a Vote, THE Bot SHALL update the voting GUI to reflect the new vote distribution and name list.

---

### Requirement 4: Auto-Lock a Prediction

**User Story:** As a Creator, I want the prediction to lock automatically after the timeout I specified, so that voting closes without requiring me to manually intervene.

#### Acceptance Criteria

1. WHEN a Prediction is created, THE Bot SHALL schedule an auto-lock to occur after the Creator-specified lock timeout.
2. WHEN the lock timeout elapses for an Active Prediction, THE Bot SHALL transition the Prediction to the Locked state as if the Creator had clicked "Lock Prediction".
3. WHEN a Prediction is auto-locked, THE Bot SHALL update the GUI to reflect the Locked state and display a visual indicator that the timeout expired.
4. IF the Creator manually locks the Prediction before the timeout elapses, THEN THE Bot SHALL cancel the scheduled auto-lock.

---

### Requirement 5: Manually Lock a Prediction

**User Story:** As a Creator, I want to lock the prediction early once everyone has voted, so that no further changes can be made before I reveal the result.

#### Acceptance Criteria

1. WHEN the Creator clicks the "Lock Prediction" button on an Active Prediction, THE Bot SHALL transition the Prediction to the Locked state.
2. WHILE a Prediction is Locked, THE Bot SHALL reject any attempt by a Participant to cast or change a Vote.
3. WHEN a Prediction is Locked, THE Bot SHALL update the GUI to remove the answer selection buttons and replace the "Lock Prediction" button with a "Finalize Prediction" button visible only to the Creator.
4. WHEN a Prediction is Locked, THE Bot SHALL display a visual indicator in the GUI embed that the Prediction is locked and voting is closed.

---

### Requirement 6: Cancel a Prediction

**User Story:** As a Creator, I want to cancel a prediction at any time before it is finalized, so that I can close it without declaring a result if circumstances change.

#### Acceptance Criteria

1. WHILE a Prediction is Active or Locked, THE Bot SHALL display a "Cancel Prediction" button visible only to the Creator.
2. WHEN the Creator clicks the "Cancel Prediction" button, THE Bot SHALL present the Creator with an optional text field to enter a cancellation reason.
3. WHEN the Creator confirms the cancellation, THE Bot SHALL transition the Prediction to the Cancelled state and stop accepting votes or finalization actions.
4. WHEN a Prediction is Cancelled, THE Bot SHALL update the GUI embed to display a "Cancelled" indicator and, WHERE a cancellation reason was provided, THE Bot SHALL display the reason in the embed.
5. WHEN a Prediction is Cancelled, THE Bot SHALL remove all interactive buttons from the GUI.

---

### Requirement 7: Finalize a Prediction

**User Story:** As a Creator, I want to declare the correct answer once the outcome is known, so that the bot can identify and announce the losers.

#### Acceptance Criteria

1. WHEN the Creator clicks the "Finalize Prediction" button on a Locked Prediction, THE Bot SHALL present the Creator with a selection UI listing all allowed answers to choose the correct one.
2. WHEN the Creator selects the correct answer, THE Bot SHALL transition the Prediction to the Finalized state and record the correct answer.
3. WHEN a Prediction is Finalized, THE Bot SHALL identify all Participants whose Vote does not match the correct answer as Losers.
4. WHEN a Prediction is Finalized and at least one Loser exists, THE Bot SHALL post a message in the Channel that mentions each Loser by Discord tag and includes the text "Here are your losers for [prediction description]! Time to pay up!".
5. WHEN a Prediction is Finalized and no Losers exist, THE Bot SHALL post a message in the Channel stating that everyone predicted correctly for the given prediction description.
6. WHEN a Prediction is Finalized, THE Bot SHALL update the GUI embed to display the correct answer and the final vote breakdown.

---

### Requirement 8: Creator-Only Controls

**User Story:** As a Creator, I want exclusive control over locking, cancelling, and finalizing my prediction, so that other users cannot interfere with the event I created.

#### Acceptance Criteria

1. WHEN a user who is not the Creator clicks the "Lock Prediction" button, THE Bot SHALL display an ephemeral error message stating that only the Creator can lock the prediction.
2. WHEN a user who is not the Creator clicks the "Finalize Prediction" button, THE Bot SHALL display an ephemeral error message stating that only the Creator can finalize the prediction.
3. WHEN a user who is not the Creator clicks the "Cancel Prediction" button, THE Bot SHALL display an ephemeral error message stating that only the Creator can cancel the prediction.


