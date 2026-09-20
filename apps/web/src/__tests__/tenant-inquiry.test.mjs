import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildInquiryEmail,
  config,
  escapeHtml,
  handler,
  validateInquiry,
} from '../../netlify/functions/tenant-inquiry.mjs';

const validInquiry = {
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  name: 'Alex Smith',
  workEmail: 'alex@example.ca',
  organization: 'Example School Authority',
  role: 'Transportation director',
  topic: 'pilot_consultation',
  message: 'We would like to discuss a pilot.',
  phone: '780-555-0100',
  website: '',
};

const originalFetch = globalThis.fetch;
const originalEnv = {
  apiKey: process.env.SAFEBUS_EMAIL_PROVIDER_API_KEY,
  from: process.env.SAFEBUS_EMAIL_FROM,
  fromName: process.env.SAFEBUS_EMAIL_FROM_NAME,
  to: process.env.SAFEBUS_INQUIRY_TO,
};

function event(body = validInquiry, overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.SAFEBUS_EMAIL_PROVIDER_API_KEY = 'provider-key';
  process.env.SAFEBUS_EMAIL_FROM = 'noreply@example.ca';
  process.env.SAFEBUS_EMAIL_FROM_NAME = 'BusSafe QA';
  process.env.SAFEBUS_INQUIRY_TO = 'sales@example.ca';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries({
    SAFEBUS_EMAIL_PROVIDER_API_KEY: originalEnv.apiKey,
    SAFEBUS_EMAIL_FROM: originalEnv.from,
    SAFEBUS_EMAIL_FROM_NAME: originalEnv.fromName,
    SAFEBUS_INQUIRY_TO: originalEnv.to,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('tenant inquiry validation', () => {
  it('accepts and normalizes the allowlisted business inquiry fields', () => {
    expect(validateInquiry({ ...validInquiry, workEmail: ' ALEX@EXAMPLE.CA ' })).toMatchObject({
      workEmail: 'alex@example.ca',
      topic: 'pilot_consultation',
    });
  });

  it('rejects unknown topics, malformed request IDs, and oversized fields', () => {
    expect(validateInquiry({ ...validInquiry, topic: 'support' })).toBeNull();
    expect(validateInquiry({ ...validInquiry, requestId: 'not-a-uuid' })).toBeNull();
    expect(validateInquiry({ ...validInquiry, organization: 'School\nBcc: attacker' })).toBeNull();
    expect(validateInquiry({ ...validInquiry, message: 'x'.repeat(2001) })).toBeNull();
  });

  it('escapes all untrusted HTML content', () => {
    expect(escapeHtml(`<script>alert('x')</script>`)).toBe(
      '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;',
    );
    const email = buildInquiryEmail({
      ...validInquiry,
      organization: '<img src=x>',
      message: '<script>unsafe</script>\nSecond line',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;unsafe&lt;/script&gt;<br>Second line');
  });

  it('declares the expected Netlify rate limit', () => {
    expect(config.rateLimit).toEqual({
      windowLimit: 3,
      windowSize: 180,
      aggregateBy: ['ip', 'domain'],
    });
  });
});

describe('tenant inquiry endpoint', () => {
  it('rejects unsupported methods and content types', async () => {
    expect((await handler(event(validInquiry, { httpMethod: 'GET' }))).statusCode).toBe(405);
    expect(
      (await handler(event(validInquiry, { headers: { 'content-type': 'text/plain' } })))
        .statusCode,
    ).toBe(415);
  });

  it('silently accepts honeypot submissions without calling the provider', async () => {
    const provider = vi.fn();
    globalThis.fetch = provider;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await handler(event({ ...validInquiry, website: 'spam.example' }));

    expect(response.statusCode).toBe(200);
    expect(provider).not.toHaveBeenCalled();
  });

  it('sends only to the configured recipient with reply-to and idempotency', async () => {
    const provider = vi.fn(async () => ({ ok: true }));
    globalThis.fetch = provider;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await handler(event());

    expect(response.statusCode).toBe(200);
    expect(provider).toHaveBeenCalledOnce();
    const [, request] = provider.mock.calls[0];
    expect(request.headers['Idempotency-Key']).toBe(
      'tenant-inquiry:123e4567-e89b-42d3-a456-426614174000',
    );
    const payload = JSON.parse(request.body);
    expect(payload.to).toEqual(['sales@example.ca']);
    expect(payload.reply_to).toBe('alex@example.ca');
    expect(JSON.stringify(log.mock.calls)).not.toContain('alex@example.ca');
    expect(JSON.stringify(log.mock.calls)).not.toContain('Example School Authority');
  });

  it('fails closed when configuration is missing or the provider fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    delete process.env.SAFEBUS_INQUIRY_TO;
    expect((await handler(event())).statusCode).toBe(503);

    process.env.SAFEBUS_INQUIRY_TO = 'sales@example.ca';
    globalThis.fetch = vi.fn(async () => ({ ok: false }));
    expect((await handler(event())).statusCode).toBe(502);
  });
});
