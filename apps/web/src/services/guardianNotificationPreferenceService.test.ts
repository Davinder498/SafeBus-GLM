import { describe, expect, it } from 'vitest';
import { mapGuardianNotificationPreference } from '@/services/guardianNotificationPreferenceService';

describe('guardian notification preference mapping', () => {
  it('maps only the authorized student preference response', () => {
    expect(
      mapGuardianNotificationPreference({
        student_id: 'student-1',
        student_name: 'Avery Johnson',
        email_enabled: true,
        notify_pickup: true,
        notify_dropoff: false,
        preferences_set_at: '2026-08-09T18:00:00Z',
        access_expires_at: null,
      }),
    ).toEqual({
      studentId: 'student-1',
      studentName: 'Avery Johnson',
      emailEnabled: true,
      notifyPickup: true,
      notifyDropoff: false,
      preferencesSetAt: '2026-08-09T18:00:00Z',
      accessExpiresAt: null,
    });
  });
});
