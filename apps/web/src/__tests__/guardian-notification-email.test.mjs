import { describe, expect, it } from 'vitest';
import {
  buildGuardianEventEmail,
  classifyProviderError,
  retryDelaySeconds,
} from '../../netlify/functions/guardian-notification-email.mjs';

describe('guardian notification email template', () => {
  it.each([
    'trip_started',
    'trip_completed',
    'trip_cancelled',
    'trip_late',
    'traffic_disruption',
    'weather_disruption',
    'road_closure',
    'mechanical_disruption',
    'student_service_changed',
    'guardian_access_changed',
    'authority_announcement',
  ])('uses the authorized server copy for %s', (notificationType) => {
    const email = buildGuardianEventEmail({
      notificationType,
      notificationTitle: 'Approved title',
      notificationBody: 'Approved server message.',
      eventCreatedAt: '2026-09-29T14:00:00Z',
    });
    expect(email.subject).toBe('SafeBus: Approved title');
    expect(email.text.split('\n')[0]).toBe('Approved server message.');
  });
  it.each(['student_picked_up', 'student_dropped_off'])(
    'renders the canonical title and message for %s',
    (notificationType) => {
      const notificationTitle =
        notificationType === 'student_picked_up' ? 'Student picked up' : 'Student dropped off';
      const notificationBody =
        'Alex Morgan was ' +
        (notificationType === 'student_picked_up' ? 'picked up' : 'dropped off') +
        ' on Bus 12.';
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
    ).toThrow('canonical_notification_copy_required');
  });

  it.each([null, 'Not/A/Real_Zone'])(
    'uses the Alberta timezone for a legacy invalid timezone %s',
    (tenantTimezone) => {
      const email = buildGuardianEventEmail({
        notificationType: 'student_picked_up',
        notificationTitle: 'Student picked up',
        notificationBody: 'Alex Morgan was picked up on Bus 12.',
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
      notificationTitle: 'Student picked up',
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

describe('retry delays', () => {
  it('calculates bounded retry delays', () => {
    expect(retryDelaySeconds(1)).toBe(300);
    expect(retryDelaySeconds(2)).toBe(900);
    expect(retryDelaySeconds(3)).toBe(3600);
    expect(retryDelaySeconds(4)).toBe(10800);
    expect(retryDelaySeconds(5)).toBe(10800);
  });
});
