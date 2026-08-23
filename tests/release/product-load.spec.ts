import { expect, test } from '@playwright/test';

const PATHS = ['/', '/login', '/admin', '/driver', '/guardian/live'] as const;
const REQUESTS_PER_PATH = 12;
const CONCURRENCY = 10;
const MAX_P95_MS = 2_500;

test('bounded local release-shell load stays within the Point 10 guardrail', async ({
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'The network load guard runs once, independently of viewport.',
  );

  const baseURL = String(testInfo.project.use.baseURL);
  const target = new URL(baseURL);
  expect(['localhost', '127.0.0.1']).toContain(target.hostname);

  const queue = PATHS.flatMap((path) => Array.from({ length: REQUESTS_PER_PATH }, () => path));
  const results: Array<{ path: string; status: number; durationMs: number; marker: boolean }> = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < queue.length) {
      const index = nextIndex;
      nextIndex += 1;
      const path = queue[index];
      const startedAt = performance.now();
      const response = await request.get(path, {
        headers: { 'cache-control': 'no-cache' },
        timeout: 5_000,
      });
      const body = await response.text();
      results.push({
        path,
        status: response.status(),
        durationMs: Math.round(performance.now() - startedAt),
        marker: body.includes('SafeBus Alberta'),
      });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const durations = results.map((result) => result.durationMs).sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
  const evidence = {
    target: target.origin,
    requests: results.length,
    concurrency: CONCURRENCY,
    failures: results.filter((result) => result.status !== 200 || !result.marker).length,
    p95Ms: durations[p95Index],
    maxMs: durations.at(-1),
  };

  await testInfo.attach('point-10-local-load-evidence.json', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify({ event: 'point10_local_load', ...evidence }));

  expect(evidence.requests).toBe(PATHS.length * REQUESTS_PER_PATH);
  expect(evidence.failures).toBe(0);
  expect(evidence.p95Ms).toBeLessThanOrEqual(MAX_P95_MS);
});
