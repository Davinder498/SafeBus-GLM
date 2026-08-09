import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const read = (file) => fs.readFile(file, 'utf8');

test('production response headers include every Phase 4 control', async () => {
  const config = await read('netlify.toml');
  for (const header of [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ]) {
    assert.match(config, new RegExp(header));
  }
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /object-src 'none'/);
});

test('web and mobile release builds exclude public source maps', async () => {
  for (const configPath of ['apps/web/vite.config.ts', 'apps/mobile/vite.config.ts']) {
    assert.match(await read(configPath), /sourcemap:\s*false/);
  }
});

test('mobile WebView debugging and mixed content are disabled', async () => {
  const config = await read('apps/mobile/capacitor.config.ts');
  assert.match(config, /allowMixedContent:\s*false/);
  assert.match(config, /webContentsDebuggingEnabled:\s*false/);
});

test('fonts are self-hosted and Google font requests are absent', async () => {
  const files = await Promise.all([
    read('apps/web/index.html'),
    read('apps/mobile/index.html'),
    read('apps/web/src/index.css'),
  ]);
  const combined = files.join('\n');
  for (const forbiddenHost of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
    assert.equal(combined.includes(forbiddenHost), false);
  }
  assert.match(files[2], /@fontsource-variable\/inter/);
});

test('rollback requires protected environment confirmation and immutable ref', async () => {
  const workflow = await read('.github/workflows/rollback.yml');
  assert.match(workflow, /environment: \$\{\{ inputs\.environment \}\}/);
  assert.match(workflow, /ROLLBACK_/);
  assert.match(workflow, /git rev-parse/);
  assert.match(workflow, /netlify deploy --prod/);
});

test('CI declares every Phase 4 gate', async () => {
  const ci = await read('.github/workflows/ci.yml');
  for (const gate of [
    'Typecheck',
    'Lint',
    'Production build',
    'Unit tests',
    'RLS execution',
    'Browser smoke tests',
    'Dependency audit',
    'Secret scanning',
    'Migration verification',
  ]) {
    assert.match(ci, new RegExp(gate, 'i'));
  }
  assert.match(await read('.github/workflows/codeql.yml'), /CodeQL/);
});

test('hosted RLS runner preserves shared fixtures through dependent suites', async () => {
  const [runner, roster, cleanup] = await Promise.all([
    read('scripts/run-rls-tests.mjs'),
    read('tests/rls/student-roster-rls.sql'),
    read('tests/rls/student-roster-shared-cleanup.sql'),
  ]);

  const rosterIndex = runner.indexOf("'tests/rls/student-roster-rls.sql'");
  const guardianLinkingIndex = runner.indexOf("'tests/rls/guardian-linking-rls.sql'");
  const cleanupIndex = runner.indexOf("'tests/rls/student-roster-shared-cleanup.sql'");
  const guardianBusFirstIndex = runner.indexOf(
    "'tests/rls/guardian-bus-first-visibility-rls.sql'",
  );

  assert.ok(rosterIndex >= 0);
  assert.ok(rosterIndex < guardianLinkingIndex);
  assert.ok(guardianLinkingIndex < cleanupIndex);
  assert.ok(cleanupIndex < guardianBusFirstIndex);
  for (const historicalFile of [
    'guardian-visibility-rls.sql',
    'guardian-live-trip-visibility-rls.sql',
    'guardian-student-trip-event-visibility-rls.sql',
    'guardian-live-bus-location-rls.sql',
    'assignment-selected-driver-trips-rls.sql',
  ]) {
    assert.equal(runner.includes(`'tests/rls/${historicalFile}'`), false);
  }
  assert.match(runner, /'tests\/rls\/qr-only-driver-trip-start-rls\.sql'/);
  assert.match(runner, /'tests\/rls\/unified-direction-assignment-rls\.sql'/);
  assert.ok(roster.indexOf('commit;') < roster.indexOf('-- TEST 1:'));
  assert.doesNotMatch(roster, /PRIVILEGED CLEANUP AFTER TESTS/);
  assert.match(roster, /disable trigger protect_final_tenant_admin_delete/);
  assert.match(roster, /enable trigger protect_final_tenant_admin_delete/);
  assert.match(cleanup, /disable trigger protect_final_tenant_admin_delete/);
  assert.match(cleanup, /enable trigger protect_final_tenant_admin_delete/);
  assert.match(cleanup, /Shared student-roster RLS fixtures cleaned up/);
});

test('student roster write authorization keeps school administrators school-scoped', async () => {
  const migration = await read(
    'supabase/migrations/0080_restore_student_roster_school_scope.sql',
  );

  assert.match(
    migration,
    /current_user_role\(\) in \('tenant_admin', 'transportation_admin'\)/,
  );
  assert.match(migration, /current_user_role\(\) = 'school_admin'/);
  assert.match(migration, /p_school_id is not null/);
  assert.match(migration, /p_school_id = public\.current_school_id\(\)/);
  assert.doesNotMatch(migration, /select public\.can_write_optional_school/);
  assert.doesNotMatch(migration, /is_platform_super_admin/);
});

test('guardian browser access stays on the single bus-first RPC contract', async () => {
  const migration = await read(
    'supabase/migrations/0081_reconcile_guardian_bus_first_execute_grants.sql',
  );

  for (const retiredRpc of [
    'get_guardian_student_route_visibility',
    'get_guardian_live_trip_visibility',
    'get_guardian_live_route_overlays',
    'get_guardian_student_trip_event_visibility',
    'get_guardian_student_live_bus_location_state',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function public\\.${retiredRpc}\\(\\)[\\s\\S]*?from public, anon, authenticated`,
      ),
    );
  }
  assert.match(
    migration,
    /grant execute on function public\.get_guardian_bus_visibility\(\)\s+to authenticated/,
  );
});

test('driver manifest RLS fixtures isolate legacy seed setup from production guards', async () => {
  const manifest = await read('tests/rls/driver-active-trip-student-manifest-rls.sql');
  const firstTest = manifest.indexOf('-- TEST 1:');

  assert.ok(firstTest > 0);
  assert.ok(manifest.indexOf('commit;') < firstTest);
  assert.match(manifest, /disable trigger enforce_ready_route_trip_start/);
  assert.match(manifest, /enable trigger enforce_ready_route_trip_start/);
  assert.match(manifest, /disable trigger protect_final_tenant_admin_delete/);
  assert.match(manifest, /enable trigger protect_final_tenant_admin_delete/);
  assert.match(manifest, /insert into public\.route_trip_patterns/);
  assert.match(manifest, /insert into public\.bus_route_assignments/);
  assert.match(manifest, /insert into public\.student_bus_assignments/);
  assert.doesNotMatch(manifest, /insert into public\.student_route_assignments/);
  assert.match(manifest, /disable trigger validate_new_bus_trip_assignment_readiness/);
  assert.match(manifest, /enable trigger validate_new_bus_trip_assignment_readiness/);
  assert.match(
    manifest,
    /route_id, route_trip_pattern_id,\s+trip_name_snapshot, trip_type/,
  );
});

test('driver event RLS fixtures use current bus-service assignments', async () => {
  const events = await read('tests/rls/driver-student-trip-events-rls.sql');
  const firstTest = events.indexOf('-- TEST 1:');

  assert.ok(firstTest > 0);
  assert.ok(events.indexOf('commit;') < firstTest);
  assert.match(events, /insert into public\.route_trip_patterns/);
  assert.match(events, /insert into public\.bus_route_assignments/);
  assert.match(events, /insert into public\.student_bus_assignments/);
  assert.doesNotMatch(events, /insert into public\.student_route_assignments/);
  assert.match(events, /disable trigger enforce_ready_route_trip_start/);
  assert.match(events, /enable trigger enforce_ready_route_trip_start/);
  assert.match(events, /disable trigger validate_new_bus_trip_assignment_readiness/);
  assert.match(events, /enable trigger validate_new_bus_trip_assignment_readiness/);
  assert.match(events, /disable trigger protect_final_tenant_admin_delete/);
  assert.match(events, /enable trigger protect_final_tenant_admin_delete/);
});

test('guardian notification RLS fixtures use current bus-service assignments', async () => {
  const notifications = await read('tests/rls/guardian-notification-outbox-rls.sql');
  const firstTest = notifications.indexOf('-- TEST 1-6:');

  assert.ok(firstTest > 0);
  assert.ok(notifications.indexOf('commit;') < firstTest);
  assert.match(notifications, /insert into public\.route_trip_patterns/);
  assert.match(notifications, /insert into public\.bus_route_assignments/);
  assert.match(notifications, /insert into public\.student_bus_assignments/);
  assert.doesNotMatch(notifications, /insert into public\.student_route_assignments/);
  assert.match(notifications, /disable trigger enforce_ready_route_trip_start/);
  assert.match(notifications, /enable trigger enforce_ready_route_trip_start/);
  assert.match(notifications, /disable trigger validate_new_bus_trip_assignment_readiness/);
  assert.match(notifications, /enable trigger validate_new_bus_trip_assignment_readiness/);
  assert.match(notifications, /disable trigger protect_final_tenant_admin_delete/);
  assert.match(notifications, /enable trigger protect_final_tenant_admin_delete/);
});

test('current driver event authorization preserves guardian outbox enqueueing', async () => {
  const migration = await read(
    'supabase/migrations/0082_restore_guardian_outbox_on_current_driver_events.sql',
  );

  assert.match(migration, /from public\.student_bus_assignments sba/);
  assert.match(migration, /join public\.bus_route_assignments bra/);
  assert.doesNotMatch(migration, /student_route_assignments/);
  assert.match(migration, /route_stop_id/);
  assert.match(migration, /insert into public\.guardian_notification_outbox/);
  assert.match(migration, /sg\.status = 'active'/);
  assert.match(migration, /sg\.can_receive_notifications = true/);
  assert.match(migration, /g\.status = 'active'/);
  assert.match(
    migration,
    /revoke all on function public\.record_student_trip_event_for_active_trip\(uuid, text\)\s+from public, anon, authenticated/,
  );
});

test('admin fleet RLS contract uses PostgreSQL output metadata', async () => {
  const fleet = await read('tests/rls/admin-live-fleet-map-rls.sql');

  assert.doesNotMatch(fleet, /information_schema\.routine_columns/);
  assert.match(fleet, /candidate\.proargnames/);
  assert.match(fleet, /candidate\.oid = v_function_oid/);
});

test('browser realtime tracking access remains receive-only', async () => {
  const [migration, rlsSuite] = await Promise.all([
    read('supabase/migrations/0083_reconcile_realtime_receive_only_grants.sql'),
    read('tests/rls/secure-trip-tracking-realtime-rls.sql'),
  ]);

  assert.match(
    migration,
    /revoke insert on table realtime\.messages from public, anon, authenticated/,
  );
  assert.match(migration, /grant select on table realtime\.messages to authenticated/);
  assert.doesNotMatch(migration, /grant insert/i);
  assert.match(rlsSuite, /c\.relrowsecurity/);
  assert.match(rlsSuite, /pol\.polcmd in \('a', '\*'\)/);
  assert.match(rlsSuite, /rolname = 'anon'/);
  assert.match(rlsSuite, /rolname = 'authenticated'/);
  assert.doesNotMatch(rlsSuite, /has_table_privilege\('authenticated'.*'INSERT'/);
});

test('student CSV RLS fixtures survive preview rollback and clean up safely', async () => {
  const csvImport = await read('tests/rls/student-csv-import-rls.sql');
  const previewIndex = csvImport.indexOf('-- Preview validates');

  assert.ok(previewIndex > 0);
  assert.ok(csvImport.indexOf('commit;') < previewIndex);
  assert.equal(
    csvImport.match(/disable trigger protect_final_tenant_admin_delete/g)?.length,
    2,
  );
  assert.equal(
    csvImport.match(/enable trigger protect_final_tenant_admin_delete/g)?.length,
    2,
  );
});
