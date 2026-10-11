import { chromium } from '@playwright/test';
import { gzipSync } from 'node:zlib';

const url = new URL(process.argv[2] ?? 'http://localhost:4191');
if (
  url.protocol !== 'http:' ||
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== '/'
)
  throw new Error(
    'Measure only a local production preview, without credentials or query parameters.',
  );

const browser = await chromium.launch();
const samples = [];
try {
  for (let sample = 0; sample < 3; sample++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    // No hosted database, Auth, maps, or other external requests are permitted.
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort(),
    );
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 125000,
      uploadThroughput: 62500,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const scripts = [];
    page.on('response', (response) => {
      if (response.request().resourceType() !== 'script') return;
      scripts.push(
        response.body().then((body) => ({
          file: new URL(response.url()).pathname,
          decodedBytes: body.length,
          gzipEquivalentBytes: gzipSync(body).length,
        })),
      );
    });
    const start = performance.now();
    await page.goto(url.origin + '/login');
    await page.locator('[data-ui="login-card"]').waitFor({ state: 'visible' });
    const loginVisibleMs = Math.round(performance.now() - start);
    const downloaded = await Promise.all(scripts);
    samples.push({
      loginVisibleMs,
      decodedScriptBytes: downloaded.reduce((sum, script) => sum + script.decodedBytes, 0),
      gzipEquivalentScriptBytes: downloaded.reduce(
        (sum, script) => sum + script.gzipEquivalentBytes,
        0,
      ),
      scripts: downloaded,
    });
    await context.close();
  }
  console.log(
    JSON.stringify(
      {
        format: 1,
        route: '/login',
        previewOrigin: url.origin,
        measuredAt: new Date().toISOString(),
        conditions: {
          latencyMs: 150,
          downloadBitsPerSecond: 1000000,
          cpuSlowdown: 4,
          freshCache: true,
        },
        medianLoginVisibleMs: samples
          .map((sample) => sample.loginVisibleMs)
          .sort((a, b) => a - b)[1],
        samples,
        caveat:
          'Local preview measurements, not physical-device, rural-field, production-wire-compression or backend scale evidence.',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
