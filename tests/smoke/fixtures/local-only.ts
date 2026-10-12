import type { Page } from '@playwright/test';

const isLoopback = (url: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);

/** Install before API fixtures: later route handlers may fulfill synthetic data,
 * while any unhandled external HTTP or websocket request remains blocked. */
export async function installLocalOnlyBoundary(page: Page) {
  await page.route('**/*', (route) =>
    isLoopback(route.request().url()) ? route.continue() : route.abort('blockedbyclient'),
  );
  await page.routeWebSocket('**/*', async (socket) => {
    if (isLoopback(socket.url())) socket.connectToServer();
    else await socket.close({ code: 1000, reason: 'Local browser test boundary' });
  });
}
