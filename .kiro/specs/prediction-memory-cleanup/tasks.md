# Implementation Plan: Prediction Memory Cleanup

## Overview

Add two complementary cleanup mechanisms to `src/services/predictionService.js`:
1. Terminal-state eviction — delete predictions from the Map immediately after `finalizePrediction` or `cancelPrediction` completes all side-effects.
2. Age-based expiry sweep — a configurable repeating timer that removes stale predictions and cancels their scheduler timers.

All changes are confined to `predictionService.js`. No new files or modules are needed.

## Tasks

- [x] 1. Implement terminal-state eviction in `predictionService.js`
  - Add `predictions.delete(predictionId)` as the last statement in `finalizePrediction`, after `channel.send`
  - Add `predictions.delete(predictionId)` as the last statement in `cancelPrediction`, after `updateGui`
  - Both functions already guard against missing IDs with an early `return`, so no additional guard is needed
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.1 Write property test for terminal-state eviction (Property 1)
    - **Property 1: Terminal-state eviction removes prediction from Map**
    - **Validates: Requirements 1.1, 1.2**
    - Use `test.prop` with random prediction fields; assert `predictions.has(id) === false` after `finalizePrediction` and `cancelPrediction`

  - [x] 1.2 Write property test for side-effects before eviction (Property 2)
    - **Property 2: Side-effects complete before eviction**
    - **Validates: Requirements 1.3, 1.4**
    - Spy on `channel.send` and `message.edit`; assert they were called before the prediction is absent from the Map

  - [x] 1.3 Write property test for missing-ID no-op (Property 3)
    - **Property 3: Missing-ID operations are no-ops**
    - **Validates: Requirements 1.5, 4.2**
    - Use `fc.string()` for random IDs not in the Map; assert no throw and Map size unchanged after calling `finalizePrediction` / `cancelPrediction`

- [x] 2. Implement the cleanup sweep functions in `predictionService.js`
  - Add module-level `let _sweepHandle = null`
  - Implement internal `_runSweep(ageThresholdMs)`: iterate the Map, call `scheduler.cancel(id)` and `predictions.delete(id)` for stale entries, log count + ISO timestamp if any removed
  - Implement exported `startCleanupSweep(intervalMs = 3_600_000, ageThresholdMs = 86_400_000)`: call `stopCleanupSweep()` first (idempotent restart), then `setInterval(() => _runSweep(ageThresholdMs), intervalMs)`
  - Implement exported `stopCleanupSweep()`: clear and null `_sweepHandle` if non-null; no-op if null
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 2.1 Write property test for sweep removing exactly stale predictions (Property 4)
    - **Property 4: Sweep removes exactly the stale predictions**
    - **Validates: Requirements 2.3, 2.5, 4.1**
    - Use arbitrary `createdAt` offsets and `ageThresholdMs`; assert post-sweep Map contains only fresh entries and stale entries are absent

  - [x] 2.2 Write property test for scheduler cancel on stale eviction (Property 5)
    - **Property 5: Scheduler timer cancelled for every evicted stale prediction**
    - **Validates: Requirements 2.4**
    - Assert `scheduler.cancel` is called with each stale prediction's ID before it is removed from the Map

  - [x] 2.3 Write property test for log-iff-removed (Property 6)
    - **Property 6: Log emitted if and only if sweep removes entries**
    - **Validates: Requirements 3.1, 3.2**
    - Spy on `console.log`; assert it is called exactly once when entries are removed and not called when none are removed

  - [x] 2.4 Write unit tests for `startCleanupSweep` / `stopCleanupSweep`
    - Use Jest fake timers (`jest.useFakeTimers`)
    - Test: default arguments fire sweep after 3 600 000 ms
    - Test: `stopCleanupSweep` after start prevents further sweep executions
    - Test: `stopCleanupSweep` before start does not throw
    - Test: calling `startCleanupSweep` twice replaces the previous interval without leaking
    - _Requirements: 2.1, 2.2, 2.6, 2.7_

- [x] 3. Checkpoint — Ensure all tests pass
  - Run the full test suite (`npm test -- --run` or `npx jest`) and confirm no regressions
  - Ensure all non-optional sub-tasks above are complete; ask the user if questions arise

- [x] 4. Verify observability and no-extra-log requirements
  - Confirm `finalizePrediction` and `cancelPrediction` do not emit additional `console.log` calls for the eviction step (the delete is silent)
  - Confirm `_runSweep` logs exactly one message per sweep when predictions are removed, and nothing when none are removed
  - _Requirements: 3.1, 3.2, 3.3_

  - [x] 4.1 Write property test for Map invariant after mixed operations (Property 7)
    - **Property 7: Map invariant after mixed operations**
    - **Validates: Requirements 4.3**
    - Generate random sequences of `finalizePrediction`, `cancelPrediction`, and `_runSweep` calls; assert the Map contains only non-terminal, non-stale predictions after each sequence

- [x] 5. Final checkpoint — Ensure all tests pass
  - Run the full test suite and confirm all passing; ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- All changes are confined to `src/services/predictionService.js`
- Property tests use `test.prop` from `@fast-check/jest`, matching the existing test file pattern
- Each property test is tagged with a comment: `// Feature: prediction-memory-cleanup, Property N: <property_text>`
- `Map.delete` on a missing key is a silent no-op in JavaScript — no extra guard needed in the sweep
