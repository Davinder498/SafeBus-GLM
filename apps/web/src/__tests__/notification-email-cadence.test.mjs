import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../netlify/functions/guardian-notification-email.mjs', () => ({
  runScheduledDispatcher: vi.fn().mockResolvedValue({ statusCode: 200 }),
}));

import { runScheduledDispatcher } from '../../netlify/functions/guardian-notification-email.mjs';
import { handler } from '../../netlify/functions/guardian-notification-email-background.mjs';
import {
  authorizedCadenceStart,
  startEmailCadence,
} from '../../netlify/lib/notification-email-cadence.mjs';

const ORIGINAL_ENV = { ...process.env };
const START = Date.parse('2026-10-26T18:00:00Z');

async function signedEvent(startedAt = START) {
  await startEmailCadence(startedAt);
  const [, request] = vi.mocked(fetch).mock.calls.at(-1);
  return { httpMethod: 'POST', body: request.body, headers: request.headers };
}

describe('twenty-second email cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    process.env.URL = 'https://safebus.example.test';
    process.env.SUPABASE_SECRET_KEY = 'server-secret-for-local-test-only';
    delete process.env.SAFEBUS_NOTIFICATION_DISPATCHER_SECRET;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 202 }));
    vi.mocked(runScheduledDispatcher).mockReset().mockResolvedValue({ statusCode: 200 });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it('dispatches at 0, 20 and 40 seconds then stops before the next minute', async () => {
    const calls = [];
    vi.mocked(runScheduledDispatcher).mockImplementation(async () => {
      calls.push(Date.now() - START);
      return { statusCode: 200 };
    });
    const event = await signedEvent();
    const running = handler(event);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await running).toEqual({ statusCode: 200 });
    expect(calls).toEqual([0, 20_000, 40_000]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects unsigned, tampered, expired, future and wrong-method requests before dispatch', async () => {
    const event = await signedEvent();
    const cases = [
      { ...event, headers: {} },
      { ...event, body: JSON.stringify({ startedAt: START + 1 }) },
      { ...event, httpMethod: 'GET' },
      { ...event, isBase64Encoded: true },
      await signedEvent(START - 60_000),
      await signedEvent(START + 5_001),
    ];
    const timerCount = vi.getTimerCount();
    for (const bad of cases) expect(await handler(bad)).toEqual({ statusCode: 403 });
    expect(runScheduledDispatcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(timerCount);
  });

  it('signs using the existing server key without sending it or accepting a different key', async () => {
    const event = await signedEvent();
    expect(authorizedCadenceStart(event)).toBe(START);
    expect(JSON.stringify(event)).not.toContain(process.env.SUPABASE_SECRET_KEY);
    process.env.SUPABASE_SECRET_KEY = 'different-server-key';
    expect(authorizedCadenceStart(event)).toBe(null);
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'different-server-key';
    const fallback = await signedEvent();
    expect(authorizedCadenceStart(fallback)).toBe(START);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(authorizedCadenceStart(fallback)).toBe(null);
  });

  it('skips missed ticks after slow processing and never runs concurrent batches', async () => {
    const calls = [];
    vi.mocked(runScheduledDispatcher).mockImplementation(async () => {
      calls.push(Date.now() - START);
      await new Promise((resolve) => setTimeout(resolve, 25_000));
      return { statusCode: 200 };
    });
    const running = handler(await signedEvent());
    await vi.advanceTimersByTimeAsync(70_000);
    await running;
    expect(calls).toEqual([0, 40_000]);
  });

  it('continues at the next tick after a transient dispatch error', async () => {
    vi.mocked(runScheduledDispatcher).mockRejectedValueOnce(new Error('local transient failure'));
    const running = handler(await signedEvent());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await running).toEqual({ statusCode: 200 });
    expect(runScheduledDispatcher).toHaveBeenCalledTimes(3);
  });

  it('does not replay an expired platform retry', async () => {
    const event = await signedEvent();
    vi.setSystemTime(START + 60_000);
    expect(await handler(event)).toEqual({ statusCode: 403 });
    expect(runScheduledDispatcher).not.toHaveBeenCalled();
  });

  it('fails handoff for non-202 responses, network errors or insecure configuration', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ status: 200 });
    await expect(startEmailCadence(START)).rejects.toThrow('background_start_failed');
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network'));
    await expect(startEmailCadence(START)).rejects.toThrow('network');
    process.env.URL = 'http://safebus.example.test';
    await expect(startEmailCadence(START)).rejects.toThrow('configuration_error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
