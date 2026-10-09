import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile('supabase/migrations/0120_compact_role_notifications.sql', 'utf8');
function definition(name) {
  const escaped = name.replaceAll('.', '\\.');
  const match = sql.match(
    new RegExp(`create(?: or replace)? function ${escaped}\\([\\s\\S]*?\\$\\$;`, 'i'),
  );
  assert.ok(match, `Missing ${name}`);
  return match[0];
}

test('new admin events are exceptions-only and driver assignment enforcement is preserved', () => {
  const trigger = definition('safebus_private.capture_notification_inbox_visibility');
  assert.match(
    trigger,
    /recipient_role in \('tenant_admin', 'transportation_admin', 'school_admin'\)/,
  );
  assert.match(
    trigger,
    /event_type not in \([\s\S]*'trip_cancelled'[\s\S]*'delivery_health_incident'[\s\S]*return null/,
  );
  assert.doesNotMatch(
    trigger,
    /'trip_started'|'trip_completed'|'student_picked_up'|'student_dropped_off'/,
  );
  assert.doesNotMatch(
    sql,
    /drop trigger.*enforce_driver_assignment_only|create or replace function safebus_private\.driver_can_access_notification/,
  );
  assert.match(
    definition('safebus_private.notification_recipient_can_access'),
    /driver_can_access_notification\(n\)/,
  );
});

test('guardian trip audiences require matching bus, route, direction and effective service date', () => {
  const audience = definition('safebus_private.notify_trip_audience');
  for (const predicate of [
    'bra.route_id = v_trip.route_id',
    'bra.bus_id = v_trip.bus_id',
    'bra.route_trip_pattern_id = v_trip.route_trip_pattern_id',
    'sba.route_trip_pattern_id = v_trip.route_trip_pattern_id',
    'sba.effective_from <= v_trip.service_date',
    'bra.effective_to >= v_trip.service_date',
    'sg.access_expires_at > now()',
    'p.school_id = v_school_id',
  ])
    assert.ok(audience.includes(predicate), predicate);
});

test('in-app visibility is snapshotted only on insertion without rewriting history or external delivery', () => {
  assert.match(sql, /in_app_visible boolean not null default true/);
  assert.match(sql, /before insert on public\.user_notifications/);
  assert.doesNotMatch(
    sql,
    /update public\.user_notifications(?:\s+\w+)?\s+set[^;]*in_app_visible\s*=|delete from public\.user_notifications/i,
  );
  assert.doesNotMatch(
    sql,
    /create(?: or replace)? function .*claim_push|create(?: or replace)? function .*resolve.*email/,
  );
  const preferences = definition('public.set_guardian_delivery_preferences_v3');
  assert.match(
    preferences,
    /perform public\.set_guardian_delivery_preferences_v2\(p_preferences\)/,
  );
  assert.match(preferences, /is distinct from 'boolean'/);
  assert.doesNotMatch(preferences, /update public\.user_notifications/);
});

test('inbox, detail, badge and mutation RPCs enforce the same current recipient scope', () => {
  for (const name of [
    'get_user_notifications',
    'get_user_notification_detail',
    'get_user_notification_unread_count',
    'mark_user_notifications_read',
    'mark_all_user_notifications_read',
    'archive_user_notifications',
  ]) {
    const body = definition(`public.${name}`);
    assert.match(body, /recipient_profile_id = \(select auth\.uid\(\)\)/);
    assert.match(body, /safebus_private\.notification_recipient_can_access\(n\)/);
    assert.match(body, /set search_path = ''/);
  }
  assert.match(definition('public.get_user_notifications'), /n\.in_app_visible/);
  assert.match(definition('public.get_user_notification_unread_count'), /n\.in_app_visible/);
  assert.doesNotMatch(definition('public.get_user_notification_detail'), /n\.in_app_visible/);
  const authorization = definition('safebus_private.notification_recipient_can_access');
  for (const predicate of [
    'p.role = n.recipient_role',
    'p.tenant_id = n.tenant_id',
    'p.school_id = n.school_id',
    'g.tenant_id = p.tenant_id',
    'sg.tenant_id = g.tenant_id',
    'sg.access_expires_at > now()',
  ]) {
    assert.ok(authorization.includes(predicate), predicate);
  }
  assert.match(sql, /for select to authenticated/);
  assert.match(sql, /get_user_notification_detail\(uuid\)[\s\S]*from public, anon, authenticated/);
});

test('shared copy uses scoped context and historical snapshots with readable fallbacks', () => {
  const copy = definition('safebus_private.notification_copy');
  for (const context of [
    'student.preferred_name',
    'trip.bus_number_snapshot',
    'trip.trip_name_snapshot',
    'route.route_code',
    'pattern.display_name',
    'driver_profile.full_name',
    'tenant.timezone',
    'America/Edmonton',
    'Mon FMDD, YYYY',
    'the assigned bus',
    'the assigned route',
    'the driver',
  ]) {
    assert.ok(copy.includes(context), context);
  }
  assert.match(copy, /' was recorded for '/);
  assert.match(copy, /' was completed'/);
  assert.match(copy, /' was reported late'/);
  assert.match(definition('public.get_user_notifications'), /notification_copy\(n\)/);
  assert.match(definition('public.get_user_notification_detail'), /notification_copy\(n\)/);
});
