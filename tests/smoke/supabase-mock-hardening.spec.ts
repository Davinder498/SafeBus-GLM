import { expect, test } from '@playwright/test';
import { installSupabaseMock, unexpectedSupabaseRestAccessHint } from './fixtures/supabase-mock';

test.describe('Supabase smoke mock hardening', () => {
  test('blocks unexpected REST table reads and writes loudly', async ({ page }) => {
    await installSupabaseMock(page);

    await page.goto('/');

    const readResponse = await page.evaluate(async () => {
      const response = await fetch('https://placeholder.supabase.co/rest/v1/student_trip_events?select=*');
      return { status: response.status, body: await response.json() };
    });
    expect(readResponse.status).toBe(500);
    expect(readResponse.body).toEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/rest/v1/student_trip_events',
        message: expect.stringContaining(unexpectedSupabaseRestAccessHint),
      }),
    );

    const writeResponse = await page.evaluate(async () => {
      const response = await fetch('https://placeholder.supabase.co/rest/v1/student_trip_events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ student_id: 'synthetic-smoke-test-only' }),
      });
      return { status: response.status, body: await response.json() };
    });
    expect(writeResponse.status).toBe(500);
    expect(writeResponse.body).toEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/rest/v1/student_trip_events',
        message: expect.stringContaining(unexpectedSupabaseRestAccessHint),
      }),
    );
  });
});
