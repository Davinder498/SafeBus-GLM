import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

// Fixed diagnostics only: never include provider messages, identities or tokens.
export function checkedCapacityAuth(result) {
  if (result.error) {
    const status = result.error.status;
    if (status === 429) throw Error('CAPACITY_AUTH_RATE_LIMIT');
    if (Number.isInteger(status) && status >= 400 && status <= 599)
      throw Error(`CAPACITY_AUTH_HTTP_${status}`);
    throw Error('CAPACITY_AUTH_FAILED');
  }
  return result.data;
}

export function summarizeCapacitySessionWindow(accounts, requiredRemainingMs, now = Date.now()) {
  let minimumRemainingMs = null;
  let invalidExpiryCount = 0;
  let shortExpiryCount = 0;
  for (const { expiresAt } of accounts) {
    if (!Number.isFinite(expiresAt)) {
      invalidExpiryCount++;
      continue;
    }
    const remainingMs = expiresAt - now;
    minimumRemainingMs = minimumRemainingMs === null ? remainingMs : Math.min(minimumRemainingMs, remainingMs);
    if (remainingMs < requiredRemainingMs) shortExpiryCount++;
  }
  return {
    driverCount: accounts.length,
    requiredRemainingMs,
    minimumRemainingMs,
    invalidExpiryCount,
    shortExpiryCount,
    passed: accounts.length > 0 && invalidExpiryCount === 0 && shortExpiryCount === 0,
  };
}

// Sequential fixture sign-ins, outside measured load. Preserve provider limits.
// Default token limit is 150 / 5 minutes. The isolated 5,000-driver run
// uses a separately configured quota and does not depend on its initial burst.
export function createCapacityLogin({
  signal,
  minimumIntervalMs = 2100,
  clock = () => performance.now(),
  wait = delay,
  onRetry = () => {},
} = {}) {
  if (!Number.isInteger(minimumIntervalMs) || minimumIntervalMs < 250)
    throw Error('CAPACITY_AUTH_PACING_INVALID');
  let nextStart = 0;
  let retryWaitMs = 0;
  return async (operation) => {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw Error('CAPACITY_STOP_REQUESTED');
      const pause = Math.max(0, nextStart - clock());
      if (pause) await wait(pause, undefined, { signal });
      if (signal?.aborted) throw Error('CAPACITY_STOP_REQUESTED');
      nextStart = clock() + minimumIntervalMs;
      const result = await operation();
      if (result.error?.status !== 429) return checkedCapacityAuth(result);
      const backoff = 5000 * 2 ** attempt;
      if (attempt >= 3 || retryWaitMs + backoff > 120000) throw Error('CAPACITY_AUTH_RATE_LIMIT');
      retryWaitMs += backoff;
      onRetry({ backoffMs: backoff });
      await wait(backoff, undefined, { signal });
    }
  };
}
