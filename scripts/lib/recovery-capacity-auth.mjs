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

// Sequential fixture sign-ins, outside measured load. Preserve provider limits.
// Default token limit is 150 / 5 minutes; do not depend on its initial burst.
export function createCapacityLogin({
  signal,
  clock = () => performance.now(),
  wait = delay,
  onRetry = () => {},
} = {}) {
  let nextStart = 0;
  let retryWaitMs = 0;
  return async (operation) => {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw Error('CAPACITY_STOP_REQUESTED');
      const pause = Math.max(0, nextStart - clock());
      if (pause) await wait(pause, undefined, { signal });
      if (signal?.aborted) throw Error('CAPACITY_STOP_REQUESTED');
      nextStart = clock() + 2100;
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
