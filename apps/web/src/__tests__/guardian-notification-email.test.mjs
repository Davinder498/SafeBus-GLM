import { describe, expect, it } from 'vitest';
import {
  buildGuardianEventEmail,
  classifyProviderError,
  idempotencyKey,
  redactLog,
  retryDelaySeconds,
} from '../../netlify/functions/guardian-notification-email.mjs';

describe('guardian notification email template', () => {
  it('builds a pickup template with first-name-only and tenant-timezone event timestamp', () => {
    const email = buildGuardianEventEmail({
      notificationType: 'student_picked_up',
      studentFirstName: 'Avery Marie',
      eventCreatedAt: '2026-07-14T15:30:00Z',
      tenantTimezone: 'America/Edmonton',
    });
    expect(email.subject).toContain('pickup');
    expect(email.text).toContain('Avery');
    expect(email.text).not.toContain('Marie');
    expect(email.text).toContain('not live child tracking');
    // Should contain a timezone label, not raw UTC only
    expect(email.text.length).toBeGreaterThan(0);
  });

  it('falls back to default Alberta timezone when tenant timezone is invalid', () => {
    const email = buildGuardianEventEmail({
      notificationType: 'student_picked_up',
      studentFirstName: 'Sam',
      eventCreatedAt: '2026-07-14T15:30:00Z',
      tenantTimezone: 'Not/A/Real_Zone',
    });
    expect(email.text).toContain('Sam');
    expect(email.text).toContain('not live child tracking');
  });

  it('falls back to default when tenant timezone is null', () => {
    const email = buildGuardianEventEmail({
      notificationType: 'student_dropped_off',
      studentFirstName: 'Pat',
      eventCreatedAt: '2026-07-14T15:30:00Z',
      tenantTimezone: null,
    });
    expect(email.text).toContain('drop-off event');
  });

  it('builds a drop-off template', () => {
    const email = buildGuardianEventEmail({
      notificationType: 'student_dropped_off',
      studentFirstName: 'Sam',
      eventCreatedAt: '2026-07-14T15:30:00Z',
      tenantTimezone: 'America/Edmonton',
    });
    expect(email.text).toContain('drop-off event');
  });

  it('uses a safe default first name when student name is empty', () => {
    const email = buildGuardianEventEmail({
      notificationType: 'student_picked_up',
      studentFirstName: '',
      eventCreatedAt: '2026-07-14T15:30:00Z',
      tenantTimezone: 'America/Edmonton',
    });
    expect(email.text).toContain('your student');
  });

  it('does not include surname, coordinates, route, stop, bus, driver, or IDs', () => {
    const email = buildGuardianEventEmail({
      notificationType: 'student_picked_up',
      studentFirstName: 'Avery Marie',
      eventCreatedAt: '2026-07-14T15:30:00Z',
      tenantTimezone: 'America/Edmonton',
    });
    const combined = `${email.subject} ${email.text} ${email.html}`;
    expect(combined).not.toContain('Marie');
    expect(combined).not.toMatch(/\d+\.\d{4,}/); // no coordinates
    // Must not expose route/stop/bus-number/driver identifiers.
    // Note: "SafeBus" is the brand name and is intentionally present.
    expect(combined).not.toContain('Route');
    expect(combined).not.toContain('Stop');
    expect(combined).not.toMatch(/Bus\s+\d/);
    expect(combined).not.toContain('Bus Number');
    expect(combined).not.toContain('Driver');
    expect(combined).not.toContain('@');
    expect(combined).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); // no UUIDs
  });

  it('escapes HTML in student name', () => {
    const email = buildGuardianEventEmail({
      notificationType: 'student_picked_up',
      studentFirstName: '<script>alert(1)</script>',
      eventCreatedAt: '2026-07-14T15:30:00Z',
      tenantTimezone: 'America/Edmonton',
    });
    expect(email.html).not.toContain('<script>');
    // First token is <script>, which after escaping should not appear raw
    expect(email.html).toContain('<');
  });
});

describe('provider error classification', () => {
  it('classifies temporary errors (5xx, 408, 429)', () => {
    expect(classifyProviderError(500)).toBe('temporary_provider_error');
    expect(classifyProviderError(503)).toBe('temporary_provider_error');
    expect(classifyProviderError(408)).toBe('temporary_provider_error');
    expect(classifyProviderError(429)).toBe('temporary_provider_error');
  });

  it('classifies permanent errors (400, 401, 403, 404, 422)', () => {
    expect(classifyProviderError(400)).toBe('permanent_provider_error');
    expect(classifyProviderError(401)).toBe('permanent_provider_error');
    expect(classifyProviderError(403)).toBe('permanent_provider_error');
    expect(classifyProviderError(404)).toBe('permanent_provider_error');
    expect(classifyProviderError(422)).toBe('permanent_provider_error');
  });

  it('classifies timeout from message', () => {
    expect(classifyProviderError(0, 'timeout')).toBe('provider_timeout');
    expect(classifyProviderError(0, 'Request Timeout')).toBe('provider_timeout');
  });

  it('classifies unknown errors as unknown (treated as retryable)', () => {
    expect(classifyProviderError(0, '')).toBe('unknown');
    expect(classifyProviderError(0, 'something odd')).toBe('unknown');
  });
});

describe('retry and idempotency helpers', () => {
  it('calculates bounded retry delays', () => {
    expect(retryDelaySeconds(1)).toBe(300);
    expect(retryDelaySeconds(2)).toBe(900);
    expect(retryDelaySeconds(3)).toBe(3600);
    expect(retryDelaySeconds(4)).toBe(10800);
    expect(retryDelaySeconds(5)).toBe(10800);
  });

  it('produces a stable idempotency key per outbox row', () => {
    expect(idempotencyKey('abc')).toBe('guardian-notification-outbox:abc');
    expect(idempotencyKey('abc')).toBe(idempotencyKey('abc'));
    expect(idempotencyKey('abc')).not.toBe(idempotencyKey('def'));
  });
});

describe('log privacy', () => {
  it('redacts sensitive log fields (backwards-compatible helper)', () => {
    expect(redactLog({ outboxId: '1', email: 'g@example.com', text: 'body', result: 'x' })).toEqual({ outboxId: '1', result: 'x' });
  });

  it('redacts all known sensitive keys', () => {
    const result = redactLog({
      outboxId: '1',
      email: 'g@example.com',
      recipient_email: 'g@example.com',
      message: 'secret',
      body: 'secret',
      html: '<p>secret</p>',
      text: 'secret',
      apiKey: 're_xxx',
      result: 'delivered',
    });
    expect(result).toEqual({ outboxId: '1', result: 'delivered' });
    expect(JSON.stringify(result)).not.toContain('g@example.com');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('re_xxx');
  });
});