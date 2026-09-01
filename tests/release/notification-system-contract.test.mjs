import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../../supabase/migrations/0092_end_to_end_notification_system.sql', import.meta.url);
const migration = await readFile(migrationPath, 'utf8');
const nativePush = await readFile(new URL('../../apps/mobile/src/native/pushNotifications.ts', import.meta.url), 'utf8');
const androidManifest = await readFile(new URL('../../apps/mobile/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');

test('notification migration keeps device and queue data private', () => {
  assert.match(migration, /revoke all on public\.user_notifications[\s\S]*public\.android_push_devices[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /recipient_profile_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/i);
  assert.doesNotMatch(migration, /public policy/i);
});

test('notification fan-out excludes arbitrary exception details and coordinates', () => {
  const fanout = migration.slice(migration.indexOf('-- Event fan-out'), migration.indexOf('-- Authenticated inbox'));
  assert.doesNotMatch(fanout, /exception_detail/i);
  assert.doesNotMatch(fanout, /latitude|longitude|coordinates/i);
  assert.match(fanout, /traffic_delay[\s\S]*weather_delay[\s\S]*road_closure[\s\S]*mechanical_issue/i);
});

test('push claim uses leases, skip locked, five attempts and delivery-time rechecks', () => {
  const claim = migration.slice(migration.indexOf('claim_push_notification_deliveries'), migration.indexOf('complete_push_notification_delivery'));
  assert.match(claim, /for update of o skip locked/i);
  assert.match(claim, /attempt_count<5/i);
  assert.match(claim, /privacy_review_status='approved'/i);
  assert.match(claim, /access_expires_at/i);
  assert.match(claim, /last_seen_at>now\(\)-interval '90 days'/i);
});

test('quiet hours and urgent bypass are fail-closed defaults', () => {
  assert.match(migration, /push_enabled boolean not null default false/i);
  assert.match(migration, /quiet_hours_start time not null default '21:00'/i);
  assert.match(migration, /quiet_hours_end time not null default '07:00'/i);
  assert.match(migration, /urgent_bypass_quiet_hours boolean not null default true/i);
  assert.match(migration, /trip_cancelled[\s\S]*trip_missing[\s\S]*mechanical_disruption[\s\S]*road_closure/i);
  assert.match(migration, /at time zone v_timezone/i, 'quiet-hour calculation must use timezone-aware conversion for DST');
});

test('Android registration handles permission, channels, taps, refresh and cleanup', () => {
  for (const channel of ['urgent_operations', 'trip_updates', 'assignments']) assert.match(nativePush, new RegExp(channel));
  assert.match(nativePush, /requestPermissions\(\)/);
  assert.match(nativePush, /pushNotificationActionPerformed/);
  assert.match(nativePush, /register_android_push_device/);
  assert.match(nativePush, /revoke_own_push_device/);
  assert.match(nativePush, /PushNotifications\.unregister\(\)/);
  assert.match(androidManifest, /default_notification_icon/);
});
