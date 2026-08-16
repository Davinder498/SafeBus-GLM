import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('Android uses the reviewed personal-device registration contract', async () => {
  const [migration, bridge, types] = await Promise.all([
    source('supabase/migrations/0089_phase7_byod_android_tracking.sql'),
    source('apps/mobile/src/native/driverTracking.ts'),
    source('packages/types/src/database.generated.ts'),
  ]);

  assert.match(migration, /ownership in \('company_owned', 'personal'\)/);
  assert.match(migration, /p_notice_version is distinct from 'driver-location-byod-v1'/);
  assert.match(migration, /ownership = 'personal'/);
  assert.match(
    migration,
    /revoke execute on function public\.register_android_tracking_device[\s\S]+from authenticated/,
  );
  assert.match(bridge, /rpc\('register_android_byod_tracking_device'/);
  assert.doesNotMatch(bridge, /p_ownership:\s*'company_owned'/);
  assert.match(types, /register_android_byod_tracking_device/);
  assert.match(migration, /create or replace function public\.revoke_driver_tracking_devices/);
  assert.match(migration, /perform public\.enforce_mfa_if_required\(\)/);
  assert.match(migration, /driver\.tracking_devices_revoked/);
});

test('background location disclosure precedes native permission preparation', async () => {
  const [scanner, disclosure, plugin] = await Promise.all([
    source('apps/web/src/components/driver/BusQrStartScanner.tsx'),
    source('apps/web/src/lib/driverLocationDisclosure.ts'),
    source(
      'apps/mobile/android/app/src/main/java/com/safebusalberta/app/tracking/DriverTrackingPlugin.java',
    ),
  ]);

  assert.match(disclosure, /collects precise location data/i);
  assert.match(disclosure, /app is closed or not in use/i);
  assert.ok(
    scanner.indexOf("setState('location-disclosure')") < scanner.indexOf('native.prepare()'),
  );
  assert.match(scanner, /Continue and allow location/);
  assert.match(plugin, /"always"\.equals\(permissionState\(\)\)/);
  assert.match(plugin, /NOTIFICATION_PERMISSION_REQUIRED/);
});

test('one Android binary remains role-scoped for guardians and drivers', async () => {
  const [routes, sdk, manifest, gradle, workflow] = await Promise.all([
    source('apps/mobile/src/routes/router.tsx'),
    source('apps/mobile/android/variables.gradle'),
    source('apps/mobile/android/app/src/main/AndroidManifest.xml'),
    source('apps/mobile/android/app/build.gradle'),
    source('.github/workflows/release-android.yml'),
  ]);

  assert.match(routes, /allowedRoles=\{\['driver'\]\}/);
  assert.match(routes, /allowedRoles=\{\['guardian'\]\}/);
  assert.match(sdk, /targetSdkVersion = 36/);
  assert.match(manifest, /android:foregroundServiceType="location"/);
  assert.doesNotMatch(manifest, /FOREGROUND_SERVICE_DATA_SYNC|location\|dataSync/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  assert.match(gradle, /SAFEBUS_ANDROID_VERSION_CODE/);
  assert.match(workflow, /SAFEBUS_ANDROID_VERSION_CODE: \$\{\{ github\.run_number \}\}/);
  assert.match(workflow, /bundleRelease/);
  assert.match(workflow, /jarsigner -verify -verbose -certs/);
  assert.match(workflow, /grep -q "jar verified\."/);
  assert.match(workflow, /grep -qi "jar is unsigned"/);
  assert.doesNotMatch(workflow, /SAFEBUS_ANDROID_KEYSTORE_BASE64:\s*[^$\n]/);
});

test('tenant administrators have an audited lost-phone revocation path', async () => {
  const [service, page, migration] = await Promise.all([
    source('apps/web/src/services/adminPeopleService.ts'),
    source('apps/web/src/pages/AdminDriverDetailPage.tsx'),
    source('supabase/migrations/0089_phase7_byod_android_tracking.sql'),
  ]);

  assert.match(service, /rpc\('revoke_driver_tracking_devices'/);
  assert.match(page, /Revoke phone tracking/);
  assert.match(page, /does not\s+inspect or erase any\s+personal content/);
  assert.match(migration, /current_user_role\(\) <> 'tenant_admin'/);
  assert.match(migration, /revoke_all_user_sessions\(p_profile_id\)/);
  assert.match(migration, /driver\.tracking_devices_revoked/);
});
