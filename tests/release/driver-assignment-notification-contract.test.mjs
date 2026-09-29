import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const migration = await readFile(
  'supabase/migrations/0111_driver_assignment_notifications.sql',
  'utf8',
);

describe('driver assignment notification contract', () => {
  it('exposes only authenticated own-driver preference RPCs', () => {
    assert.match(migration, /get_driver_delivery_preferences\(\)/);
    assert.match(migration, /set_driver_delivery_preferences\(p_preferences jsonb\)/);
    assert.match(migration, /role = 'driver'/);
    assert.match(migration, /profile_id = v_profile\.id/);
    assert.match(
      migration,
      /grant execute on function public\.get_driver_delivery_preferences\(\) to authenticated/,
    );
    assert.match(migration, /from public, anon/);
  });

  it('limits driver inbox and delivery to the three assignment events', () => {
    for (const eventType of [
      'driver_assignment_created',
      'driver_assignment_changed',
      'driver_assignment_ended',
    ]) {
      assert.match(migration, new RegExp(eventType));
    }
    assert.match(migration, /enforce_driver_assignment_only_notification/);
    assert.match(migration, /safebus_private\.driver_can_access_notification\(n\)/);
    assert.match(migration, /set status = 'cancelled'/);
  });

  it('keeps the email outbox private and adds generic service-only RPCs', () => {
    assert.match(migration, /recipient_profile_id/);
    assert.match(
      migration,
      /guardian_notification_outbox\(recipient_profile_id, status, available_after\)/,
    );
    assert.doesNotMatch(migration, /\bavailable_at\b/);
    assert.match(migration, /revoke all on table public\.guardian_notification_outbox/);
    for (const rpc of [
      'claim_notification_email_batch',
      'resolve_notification_email_recipient',
      'complete_notification_email',
      'retry_notification_email',
      'fail_notification_email',
      'cancel_notification_email',
      'requeue_notification_email_dead_letter',
    ]) {
      assert.match(migration, new RegExp(rpc));
    }
    assert.match(migration, /to service_role/);
  });

  it('preserves every existing guardian outbox notification type', () => {
    for (const eventType of [
      'student_picked_up',
      'student_dropped_off',
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
    ]) {
      assert.match(migration, new RegExp(`'${eventType}'`));
    }
  });
});
