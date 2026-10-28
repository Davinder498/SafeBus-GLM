import { describe, expect, it } from 'vitest';
import {
  buildGuardianEventEmail,
  classifyProviderError,
  idempotencyKey,
  redactLog,
  retryDelaySeconds,
} from '../../netlify/functions/guardian-notification-email.mjs';

describe('guardian notification email template', () => {
  it('keeps trip and operational email copy free of student names', () => {
    const email = buildGuardianEventEmail({
      notificationType: 'trip_late',
      studentFirstName: 'PrivateStudentName',
      eventCreatedAt: '2026-09-29T14:00:00.000Z',
      tenantTimezone: 'America/Edmonton',
    });

    expect(email.subject).toBe('SafeBus: Bus reported late');
    expect(email.text).toContain('Open SafeBus to view the update');
    expect(email.text).not.toContain('PrivateStudentName');
    expect(email.html).not.toContain('PrivateStudentName');
  });

  it.each([
    'trip_started',
    'trip_completed',
    'trip_cancelled',
    'trip_late',
    'trip_missing',
    'traffic_disruption',
    'weather_disruption',
    'road_closure',
    'mechanical_disruption',
    'student_service_changed',
    'guardian_access_changed',
    'authority_announcement',
  ])('uses controlled privacy-safe copy for %s', (notificationType) => {
    const email = buildGuardianEventEmail({
      notificationType,
      studentFirstName: 'DoNotRender',
      eventCreatedAt: '2026-09-29T14:00:00.000Z',
      tenantTimezone: 'America/Edmonton',
    });
    expect(email.subject).toMatch(/^SafeBus:/);
    expect(`${email.text} ${email.html}`).not.toContain('DoNotRender');
  });

  it.each(['student_picked_up', 'student_dropped_off'])(
    'renders the canonical title and message for %s',
    (notificationType) => {
      const notificationTitle =
        notificationType === 'student_picked_up' ? 'Pickup recorded' : 'Drop-off recorded';
      const notificationBody =
        'Alex Morgan was ' +
        (notificationType === 'student_picked_up' ? 'picked up' : 'dropped off') +
        ' on Bus 12 at Maple Street.';
      const email = buildGuardianEventEmail({
        notificationType,
        notificationTitle,
        notificationBody,
        eventCreatedAt: '2026-07-14T15:30:00Z',
        tenantTimezone: 'America/Edmonton',
      });
      expect(email.subject).toBe('SafeBus: ' + notificationTitle);
      expect(email.text.split('\n')[0]).toBe(notificationBody);
      expect(email.html).toContain('<p>' + notificationBody + '</p>');
      expect(email.text).toContain('Recorded:');
      expect(email.text).not.toContain('not live child tracking');
    },
  );

  it('rejects missing canonical copy instead of reverting to first-name-only email', () => {
    expect(() =>
      buildGuardianEventEmail({ notificationType: 'student_picked_up', studentFirstName: 'Alex' }),
    ).toThrow('canonical_pickup_dropoff_copy_required');
  });

  it.each([null, 'Not/A/Real_Zone'])(
    'uses the Alberta timezone for a legacy invalid timezone %s',
    (tenantTimezone) => {
      const email = buildGuardianEventEmail({
        notificationType: 'student_picked_up',
        notificationTitle: 'Pickup recorded',
        notificationBody: 'Alex Morgan was picked up on Bus 12 at Maple Street.',
        eventCreatedAt: '2026-07-14T15:30:00Z',
        tenantTimezone,
      });
      expect(email.text).toContain('America/Edmonton');
    },
  );

  it('escapes complete canonical message HTML while preserving plain text', () => {
    const notificationBody = 'Alex <Morgan> was picked up on Bus 12 at Maple & School.';
    const email = buildGuardianEventEmail({
      notificationType: 'student_picked_up',
      notificationTitle: 'Pickup recorded',
      notificationBody,
      eventCreatedAt: '2026-07-14T15:30:00Z',
    });
    expect(email.text.split('\n')[0]).toBe(notificationBody);
    expect(email.html).toContain('Alex &lt;Morgan&gt;');
    expect(email.html).toContain('Maple &amp; School');
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

describe('driver assignment email privacy', () => {
  for (const [notificationType, label] of [
    ['driver_assignment_created', 'Assignment created'],
    ['driver_assignment_changed', 'Assignment changed'],
    ['driver_assignment_ended', 'Assignment ended'],
  ]) {
    it(`builds generic ${label.toLowerCase()} copy`, () => {
      const email = buildGuardianEventEmail({ notificationType });
      expect(email.subject).toBe(`SafeBus: ${label}`);
      expect(email.text).toContain('Open SafeBus to view the update.');
      expect(email.text).not.toMatch(/\b(bus|route|stop|schedule|student)\b/i);
    });
  }
});

describe('log privacy', () => {
  it('redacts sensitive log fields (backwards-compatible helper)', () => {
    expect(redactLog({ outboxId: '1', email: 'g@example.com', text: 'body', result: 'x' })).toEqual(
      { outboxId: '1', result: 'x' },
    );
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
