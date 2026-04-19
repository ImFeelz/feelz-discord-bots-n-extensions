// Validates: Requirements 4.1, 4.4
import { jest, test, expect, beforeEach, afterEach } from '@jest/globals';
import { schedule, cancel, getRemainingMs } from '../../services/scheduler.js';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('schedule fires callback after the specified delay', () => {
  const cb = jest.fn();
  schedule('sched-1', 5000, cb);
  expect(cb).not.toHaveBeenCalled();
  jest.advanceTimersByTime(5000);
  expect(cb).toHaveBeenCalledTimes(1);
  cancel('sched-1');
});

test('cancel prevents the callback from firing after cancellation', () => {
  const cb = jest.fn();
  schedule('sched-2', 5000, cb);
  cancel('sched-2');
  jest.advanceTimersByTime(10000);
  expect(cb).not.toHaveBeenCalled();
});

test('getRemainingMs returns approximately the correct remaining time', () => {
  schedule('sched-3', 10000, () => {});
  jest.advanceTimersByTime(3000);
  const remaining = getRemainingMs('sched-3');
  expect(remaining).toBeGreaterThan(0);
  expect(remaining).toBeLessThanOrEqual(10000);
  cancel('sched-3');
});

test('getRemainingMs returns 0 for an unknown predictionId', () => {
  expect(getRemainingMs('no-such-id')).toBe(0);
});

test('cancel on an unknown predictionId does not throw', () => {
  expect(() => cancel('no-such-id')).not.toThrow();
});
