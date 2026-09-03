import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../../supabase/migrations/0092_end_to_end_notification_system.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');
const schedulerMigration = await readFile(
  new URL(
    '../../supabase/migrations/0094_schedule_push_notification_dispatcher.sql',
    import.meta.url,
  ),
  'utf8',
);
const edgeConfig = await readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
const edgeHandler = await readFile(
  new URL('../../supabase/functions/push-notification-dispatcher/index.ts', import.meta.url),
  'utf8',
);
const edgeDependencies = await readFile(
  new URL('../../supabase/functions/push-notification-dispatcher/deno.json', import.meta.url),
  'utf8',
);
const edgeLock = await readFile(
  new URL('../../supabase/functions/push-notification-dispatcher/deno.lock', import.meta.url),
  'utf8',
);
const dispatcherCore = await readFile(
  new URL('../../supabase/functions/_shared/push-dispatcher-core.mjs', import.meta.url),
  'utf8',
);
const netlifyConfig = await readFile(new URL('../../netlify.toml', import.meta.url), 'utf8');
const nativePush = await readFile(
  new URL('../../apps/mobile/src/native/pushNotifications.ts', import.meta.url),
  'utf8',
);
const androidManifest = await readFile(
  new URL('../../apps/mobile/android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8',
);
const nativeDevicePlugin = await readFile(
  new URL(
    '../../apps/mobile/android/app/src/main/java/com/safebusalberta/app/tracking/DriverTrackingPlugin.java',
    import.meta.url,
  ),
  'utf8',
);
const nativeAuthLinks = await readFile(
  new URL('../../apps/mobile/src/native/authDeepLinks.ts', import.meta.url),
  'utf8',
);
const authContext = await readFile(
  new URL('../../apps/web/src/contexts/AuthContext.tsx', import.meta.url),
  'utf8',
);

test('notification migration keeps device and queue data private', () => {
  assert.match(
    migration,
    /revoke all on public\.user_notifications[\s\S]*public\.android_push_devices[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(migration, /recipient_profile_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/i);
  assert.doesNotMatch(migration, /public policy/i);
});

test('notification fan-out excludes arbitrary exception details and coordinates', () => {
  const fanout = migration.slice(
    migration.indexOf('-- Event fan-out'),
    migration.indexOf('-- Authenticated inbox'),
  );
  assert.doesNotMatch(fanout, /exception_detail/i);
  assert.doesNotMatch(fanout, /latitude|longitude|coordinates/i);
  assert.match(
    fanout,
    /traffic_delay[\s\S]*weather_delay[\s\S]*road_closure[\s\S]*mechanical_issue/i,
  );
});

test('push claim uses leases, skip locked, five attempts and delivery-time rechecks', () => {
  const claim = migration.slice(
    migration.indexOf('claim_push_notification_deliveries'),
    migration.indexOf('complete_push_notification_delivery'),
  );
  assert.match(claim, /for update of o skip locked/i);
  assert.match(claim, /attempt_count<5/i);
  assert.match(claim, /privacy_review_status='approved'/i);
  assert.match(claim, /access_expires_at/i);
  assert.match(claim, /last_seen_at>now\(\)-interval '90 days'/i);
});

test('push dispatch is isolated to a secret-protected Supabase Edge Function', () => {
  assert.match(edgeConfig, /\[functions\.push-notification-dispatcher\][\s\S]*enabled\s*=\s*true/);
  assert.match(
    edgeConfig,
    /\[functions\.push-notification-dispatcher\][\s\S]*verify_jwt\s*=\s*false/,
  );
  assert.match(edgeHandler, /request\.method !== 'POST'/);
  assert.match(edgeHandler, /x-safebus-push-secret/);
  assert.match(edgeHandler, /timingSafeSecretEqual/);
  assert.match(edgeHandler, /expectedSecret\.length < 32/);
  assert.match(edgeHandler, /withSupabase\(\{ auth: 'none' \}/);
  assert.match(edgeHandler, /context\.supabaseAdmin/);
  assert.doesNotMatch(edgeHandler, /SUPABASE_(?:SECRET_KEYS|SERVICE_ROLE_KEY)/);
  assert.match(edgeHandler, /SAFEBUS_FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(edgeDependencies, /npm:@supabase\/server@1\.5\.2/);
  assert.match(edgeLock, /"npm:@supabase\/server@1\.5\.2"/);
  assert.match(dispatcherCore, /authorization: `Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(netlifyConfig, /push-notification-dispatcher-scheduled/);
});

test('one-minute scheduler is fail-closed and reads credentials only from Vault', () => {
  assert.match(schedulerMigration, /create extension if not exists pg_cron/i);
  assert.match(schedulerMigration, /create extension if not exists pg_net/i);
  assert.match(schedulerMigration, /'\* \* \* \* \*'/);
  assert.match(schedulerMigration, /vault\.decrypted_secrets/i);
  assert.match(schedulerMigration, /safebus_project_url/);
  assert.match(schedulerMigration, /safebus_push_dispatcher_secret/);
  assert.match(schedulerMigration, /length\(dispatcher_secret\) >= 32/i);
  assert.doesNotMatch(schedulerMigration, /BEGIN PRIVATE KEY|service_role|eyJ[A-Za-z0-9_-]+/);
});

test('FCM payload and diagnostics remain privacy safe', () => {
  assert.match(migration, /'Open SafeBus to view this update\.'/);
  assert.match(dispatcherCore, /notification: \{ title: row\.title, body: row\.body \}/);
  assert.match(dispatcherCore, /visibility: 'PRIVATE'/);
  assert.doesNotMatch(dispatcherCore, /studentName|routeName|stopName|latitude|longitude/);
  assert.doesNotMatch(dispatcherCore, /console\.(?:log|error)[\s\S]*outbox_id/);
});

test('quiet hours and urgent bypass are fail-closed defaults', () => {
  assert.match(migration, /push_enabled boolean not null default false/i);
  assert.match(migration, /quiet_hours_start time not null default '21:00'/i);
  assert.match(migration, /quiet_hours_end time not null default '07:00'/i);
  assert.match(migration, /urgent_bypass_quiet_hours boolean not null default true/i);
  assert.match(
    migration,
    /trip_cancelled[\s\S]*trip_missing[\s\S]*mechanical_disruption[\s\S]*road_closure/i,
  );
  assert.match(
    migration,
    /at time zone v_timezone/i,
    'quiet-hour calculation must use timezone-aware conversion for DST',
  );
});

test('Android registration handles permission, channels, taps, refresh and cleanup', () => {
  for (const channel of ['urgent_operations', 'trip_updates', 'assignments'])
    assert.match(nativePush, new RegExp(channel));
  assert.match(nativePush, /requestPermissions\(\)/);
  assert.match(nativePush, /pushNotificationActionPerformed/);
  assert.match(nativePush, /register_android_push_device/);
  assert.match(nativePush, /revoke_own_push_device/);
  assert.match(nativePush, /PushNotifications\.unregister\(\)/);
  assert.match(androidManifest, /default_notification_icon/);
});

test('unconfigured Firebase builds cannot invoke token registration or terminate login', () => {
  assert.match(nativeDevicePlugin, /getIdentifier\([\s\S]*"google_app_id"/);
  assert.match(nativeDevicePlugin, /result\.put\("pushConfigured", pushConfigured\(\)\)/);
  assert.ok(
    nativePush.indexOf('if (!pushConfigured)') < nativePush.indexOf('PushNotifications.register()'),
  );
  assert.match(nativePush, /available: false/);
  assert.match(authContext, /SafeBusNativePush\?\.available/);
  assert.match(authContext, /deactivate\(\)\.catch\(\(\) => undefined\)/);
});

test('Android password recovery uses an app-owned deep link and removes auth tokens from navigation', () => {
  assert.match(androidManifest, /android:scheme="@string\/custom_url_scheme"/);
  assert.match(androidManifest, /android:host="auth"/);
  assert.match(androidManifest, /android:pathPrefix="\/update-password"/);
  assert.match(nativeAuthLinks, /appUrlOpen/);
  assert.match(nativeAuthLinks, /getLaunchUrl\(\)/);
  assert.match(nativeAuthLinks, /supabase\.auth\.setSession/);
  assert.match(nativeAuthLinks, /window\.history\.replaceState\(\{\}, '', path\)/);
  assert.doesNotMatch(nativeAuthLinks, /console\.(log|error|warn)/);
  assert.doesNotMatch(nativeAuthLinks, /sessionStorage\.setItem\([\s\S]*error\.message/);
});
