import { describe, expect, it } from 'vitest';
import { buildGuardianEventEmail, classifyProviderError, idempotencyKey, redactLog, retryDelaySeconds } from '../../netlify/functions/guardian-notification-email.mjs';

describe('guardian notification email delivery helpers', () => {
  it('builds a pickup template with first-name-only and UTC event timestamp', () => {
    const email = buildGuardianEventEmail({ notificationType: 'student_picked_up', studentFirstName: 'Avery Marie', eventCreatedAt: '2026-07-14T15:30:00Z' });
    expect(email.subject).toContain('pickup');
    expect(email.text).toContain('Avery');
    expect(email.text).not.toContain('Marie');
    expect(email.text).toContain('UTC');
    expect(email.text).toContain('not live child tracking');
  });
  it('builds a drop-off template', () => {
    expect(buildGuardianEventEmail({ notificationType: 'student_dropped_off', studentFirstName: 'Sam', eventCreatedAt: '2026-07-14T15:30:00Z' }).text).toContain('drop-off event');
  });
  it('classifies provider errors safely', () => {
    expect(classifyProviderError(500)).toBe('temporary_provider_error');
    expect(classifyProviderError(422)).toBe('permanent_provider_error');
    expect(classifyProviderError(0, 'timeout')).toBe('provider_timeout');
  });
  it('calculates bounded retry delays and idempotency key', () => {
    expect(retryDelaySeconds(1)).toBe(300);
    expect(retryDelaySeconds(4)).toBe(10800);
    expect(idempotencyKey('abc')).toBe('guardian-notification-outbox:abc');
  });
  it('redacts sensitive log fields', () => {
    expect(redactLog({ outboxId: '1', email: 'g@example.com', text: 'body', result: 'x' })).toEqual({ outboxId: '1', result: 'x' });
  });
});
