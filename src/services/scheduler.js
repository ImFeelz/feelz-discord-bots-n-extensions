const timers = new Map();

export function schedule(predictionId, delayMs, callback) {
  const handle = setTimeout(callback, delayMs);
  timers.set(predictionId, { handle, startedAt: Date.now(), delayMs });
}

export function cancel(predictionId) {
  const entry = timers.get(predictionId);
  if (!entry) return;
  clearTimeout(entry.handle);
  timers.delete(predictionId);
}

export function getRemainingMs(predictionId) {
  const entry = timers.get(predictionId);
  if (!entry) return 0;
  return Math.max(0, entry.delayMs - (Date.now() - entry.startedAt));
}
