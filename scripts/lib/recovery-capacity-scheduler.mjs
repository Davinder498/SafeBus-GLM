import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
export function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const p = (q) =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)] : null;
  return { p50: p(0.5), p95: p(0.95), p99: p(0.99) };
}
// Open-loop arrivals: never silently reduce offered load when the service slows.
export async function runArrivals({
  count,
  periodMs,
  durationMs,
  operation,
  onError = () => {},
  maxInFlight = 64,
  signal,
  clock = () => performance.now(),
  wait = delay,
}) {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 500 ||
    periodMs < 1000 ||
    durationMs < 1 ||
    durationMs > 300000
  )
    throw Error('CAPACITY_BOUNDS');
  const start = clock(),
    pending = new Set(),
    latencies = [];
  let offered = 0,
    completed = 0,
    errors = 0,
    missed = 0,
    maxLagMs = 0;
  const expected = Math.ceil((durationMs * count) / periodMs);
  for (let n = 0; n < expected; n++) {
    if (signal?.aborted) break;
    const due = start + (n * periodMs) / count;
    if (clock() < due) await wait(due - clock());
    if (signal?.aborted) break;
    const lag = clock() - due;
    maxLagMs = Math.max(maxLagMs, lag);
    offered++;
    if (lag > 1000 || pending.size >= maxInFlight) {
      missed++;
      break;
    }
    const began = clock();
    const p = Promise.resolve()
      .then(() => operation(n % count, Math.floor(n / count)))
      .then(
        () => {
          completed++;
          latencies.push(clock() - began);
        },
        (error) => {
          errors++;
          onError(error);
        },
      )
      .finally(() => pending.delete(p));
    pending.add(p);
    if (errors > 0) break; // conservative exploratory stop; no retries hide failure
  }
  await Promise.all(pending);
  return {
    expected,
    offered,
    completed,
    errors,
    missed,
    maxLagMs,
    elapsedMs: clock() - start,
    latencyMs: percentiles(latencies),
    passed:
      offered === expected &&
      completed === expected &&
      errors === 0 &&
      missed === 0 &&
      percentiles(latencies).p99 <= 5000,
  };
}
