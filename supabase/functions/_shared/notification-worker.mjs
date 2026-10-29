// Shared by Node email and Deno push. No provider, identity or message content.
export async function mapConcurrent(items, concurrency, run) {
  const results = new Array(items.length);
  let next = 0;
  const count = Math.max(1, Math.min(Math.trunc(concurrency) || 1, 128, items.length));
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (next < items.length) {
        const index = next++;
        try {
          results[index] = { status: 'fulfilled', value: await run(items[index], index) };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    }),
  );
  return results;
}

export async function drainNotifications({
  claim,
  deliver,
  concurrency = 16,
  budgetMs = 15_000,
  maxMessages = 50_000,
  now = Date.now,
  retryIdle = false,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  settle,
}) {
  const deadline = now() + Math.max(0, Math.min(budgetMs, 50_000));
  const limit = Math.max(1, Math.min(maxMessages, 100_000));
  const summary = { claimed: 0, delivered: 0, retry: 0, failed: 0, cancelled: 0, error: 0 };
  let empty = 0;
  while (now() < deadline && summary.claimed < limit) {
    const rows = await claim(Math.min(200, limit - summary.claimed));
    if (!rows?.length) {
      if (retryIdle && summary.claimed && empty++ === 0 && now() + 1000 < deadline) {
        await sleep(1000);
        continue;
      }
      break;
    }
    empty = 0;
    summary.claimed += rows.length;
    const results = await mapConcurrent(rows, concurrency, deliver);
    if (settle) await settle(results.filter((r) => r.status === 'fulfilled').map((r) => r.value));
    for (const result of results) {
      const state = result.status === 'fulfilled' ? (result.value?.state ?? result.value) : 'error';
      if (Object.hasOwn(summary, state) && state !== 'claimed') summary[state]++;
      else summary.error++;
    }
    // A failed claim group must not spin rapidly against a broken dependency.
    if (results.every((result) => result.status === 'rejected')) break;
  }
  return summary;
}

// One claim, one final authorization/read, and one settlement per group. Provider
// calls stay independent, so email and push cannot block each other's workers.
export async function runDeliveryWorker({
  rpc,
  channel,
  workerId,
  send,
  classify,
  retryDelay,
  batchSize = 50,
  concurrency = 16,
  budgetMs = 15_000,
  maxMessages = 50_000,
  providerMinute = 600,
  now = Date.now,
  sleep,
  random = Math.random,
  onFailure,
}) {
  let payloads = new Map();
  const incidents = new Set();
  return drainNotifications({
    concurrency,
    budgetMs,
    maxMessages,
    now,
    sleep,
    retryIdle: true,
    claim: async (remaining) => {
      const rows = await rpc('claim_notification_deliveries', {
        p_channel: channel,
        p_worker_id: workerId,
        p_limit: Math.min(200, batchSize, Math.max(1, Math.min(concurrency, 128)), remaining),
        p_provider_minute: providerMinute,
      });
      if (!rows?.length) return [];
      const resolved = await rpc('resolve_notification_deliveries', {
        p_channel: channel,
        p_worker_id: workerId,
        p_ids: rows.map((r) => r.id),
      });
      payloads = new Map((resolved || []).map((r) => [r.id, r]));
      return rows;
    },
    deliver: async (row) => {
      const payload = payloads.get(row.id);
      if (!payload) return 'cancelled';
      try {
        const result = await send(payload);
        if (result?.state) return { id: row.id, ...result };
        return { id: row.id, state: 'delivered', provider_id: result };
      } catch (error) {
        const failure = classify(error);
        const incidentKey = failure.category + ':' + (payload.tenant_id ?? 'platform');
        if (onFailure && !incidents.has(incidentKey)) {
          incidents.add(incidentKey);
          try {
            await onFailure(failure, payload);
          } catch {
            /* Delivery state is authoritative. */
          }
        }
        return {
          id: row.id,
          state: failure.retry && row.attempt_count < 5 ? 'retry' : 'failed',
          category: failure.category,
          code: failure.code || failure.category,
          invalidate_device: Boolean(failure.invalidateDevice),
          retry_seconds: Math.min(
            86400,
            retryDelay(row.attempt_count, failure.retryAfter) + Math.floor(random() * 15),
          ),
        };
      }
    },
    settle: async (results) => {
      const rows = results.filter((r) => r && typeof r === 'object');
      if (!rows.length) return;
      const applied = await rpc('settle_notification_deliveries', {
        p_channel: channel,
        p_worker_id: workerId,
        p_results: rows,
      });
      if (applied !== rows.length) throw new Error('notification_settlement_incomplete');
    },
  });
}
