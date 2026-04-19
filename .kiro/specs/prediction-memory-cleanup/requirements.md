# Requirements Document

## Introduction

The Discord prediction bot maintains an in-memory `Map` of all predictions for the lifetime of the
process. Because the bot runs 24/7, predictions that have reached a terminal state (FINALIZED or
CANCELLED) and predictions that were created more than 24 hours ago but never resolved accumulate
indefinitely, growing memory usage over time.

This feature adds two complementary cleanup mechanisms:

1. **Terminal-state eviction** — remove a prediction from the in-memory `Map` as soon as it
   transitions to FINALIZED or CANCELLED.
2. **Age-based expiry** — a periodic sweep that removes any prediction whose `createdAt` timestamp
   is older than 24 hours, regardless of status, and cancels its scheduler timer if one is still
   running.

## Glossary

- **Prediction_Service**: The module at `src/services/predictionService.js` that owns the in-memory
  `predictions` Map and all state-transition functions.
- **Scheduler**: The module at `src/services/scheduler.js` that manages `setTimeout` handles for
  auto-lock timers.
- **Cleanup_Sweep**: The periodic function that scans the `predictions` Map and removes stale
  entries.
- **Terminal_State**: A prediction status of `FINALIZED` or `CANCELLED`; no further state
  transitions are possible.
- **Stale_Prediction**: A prediction whose `createdAt` timestamp is more than 24 hours before the
  current wall-clock time.
- **Age_Threshold**: The configurable maximum age of a prediction in the Map, defaulting to
  86 400 000 ms (24 hours).
- **Sweep_Interval**: The configurable period between consecutive Cleanup_Sweep executions,
  defaulting to 3 600 000 ms (1 hour).

---

## Requirements

### Requirement 1: Terminal-State Eviction

**User Story:** As a bot operator, I want predictions removed from memory immediately after they
reach a terminal state, so that resolved and cancelled predictions do not accumulate in the process
heap.

#### Acceptance Criteria

1. WHEN `finalizePrediction` completes all side-effects for a prediction, THE Prediction_Service
   SHALL delete that prediction's entry from the `predictions` Map.
2. WHEN `cancelPrediction` completes all side-effects for a prediction, THE Prediction_Service
   SHALL delete that prediction's entry from the `predictions` Map.
3. WHEN a prediction is deleted after finalization, THE Prediction_Service SHALL have already
   called `updateGui` and posted the loser announcement before the deletion occurs.
4. WHEN a prediction is deleted after cancellation, THE Prediction_Service SHALL have already
   called `updateGui` before the deletion occurs.
5. IF `finalizePrediction` or `cancelPrediction` is called with an ID that does not exist in the
   `predictions` Map, THEN THE Prediction_Service SHALL return without error and without modifying
   the Map.

---

### Requirement 2: Age-Based Expiry Sweep

**User Story:** As a bot operator, I want a periodic sweep that removes predictions older than
24 hours, so that long-lived ACTIVE or LOCKED predictions that were never resolved do not leak
memory indefinitely.

#### Acceptance Criteria

1. THE Prediction_Service SHALL expose a `startCleanupSweep(intervalMs, ageThresholdMs)` function
   that starts a repeating timer to execute the Cleanup_Sweep.
2. WHEN `startCleanupSweep` is called without arguments, THE Prediction_Service SHALL use a default
   `intervalMs` of 3 600 000 ms and a default `ageThresholdMs` of 86 400 000 ms.
3. WHEN the Cleanup_Sweep executes, THE Prediction_Service SHALL delete every prediction whose
   `createdAt` value is more than `ageThresholdMs` milliseconds before the current wall-clock time.
4. WHEN the Cleanup_Sweep deletes a Stale_Prediction that has an active Scheduler timer, THE
   Prediction_Service SHALL call `scheduler.cancel` for that prediction before removing it from the
   Map.
5. WHEN the Cleanup_Sweep executes and no predictions are Stale, THE Prediction_Service SHALL leave
   the `predictions` Map unchanged.
6. THE Prediction_Service SHALL expose a `stopCleanupSweep()` function that cancels the repeating
   timer started by `startCleanupSweep`.
7. IF `stopCleanupSweep` is called before `startCleanupSweep`, THEN THE Prediction_Service SHALL
   return without error.

---

### Requirement 3: Observability

**User Story:** As a bot operator, I want cleanup activity logged to the console, so that I can
verify the sweep is running and diagnose unexpected memory growth.

#### Acceptance Criteria

1. WHEN the Cleanup_Sweep removes one or more predictions, THE Prediction_Service SHALL log a
   single message to `console.log` containing the count of removed predictions and the current
   timestamp.
2. WHEN the Cleanup_Sweep removes zero predictions, THE Prediction_Service SHALL NOT emit any log
   output.
3. WHEN `finalizePrediction` or `cancelPrediction` evicts a prediction from the Map, THE
   Prediction_Service SHALL NOT emit additional log output beyond what already exists for those
   operations.

---

### Requirement 4: Correctness Under Concurrent State Transitions

**User Story:** As a bot operator, I want cleanup to be safe when a prediction transitions state
at the same moment a sweep runs, so that no prediction is double-deleted or left in an inconsistent
state.

#### Acceptance Criteria

1. WHEN the Cleanup_Sweep attempts to delete a prediction that has already been removed by a
   terminal-state eviction, THE Prediction_Service SHALL handle the missing key gracefully and
   continue processing remaining entries.
2. WHEN `finalizePrediction` or `cancelPrediction` is called on a prediction that the Cleanup_Sweep
   has already removed, THE Prediction_Service SHALL return without error (covered by Requirement
   1.5).
3. FOR ALL sequences of terminal-state evictions and Cleanup_Sweep executions applied to the same
   set of predictions, THE Prediction_Service SHALL produce a `predictions` Map that contains only
   non-terminal, non-stale predictions.
