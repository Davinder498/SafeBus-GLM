import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  authorizationAudiences,
  assertAdvertisedRpcSurface,
} from '../../scripts/lib/authorization-audiences.mjs';
import { PGlite } from '@electric-sql/pglite';

const migrationPath = 'supabase/migrations/0089_authorization_surface_hardening.sql';
const notificationMigrationPath = 'supabase/migrations/0092_end_to_end_notification_system.sql';

test('complete OpenAPI discovery preserves actual service execution denials and overloads', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role authenticated; create role service_role;
    create function public.driver_only() returns int language sql as 'select 1';
    create function public.worker_only() returns int language sql as 'select 1';
    create function public.shared_name(uuid) returns int language sql as 'select 1';
    create function public.shared_name(text) returns int language sql as 'select 1';
    revoke execute on all functions in schema public from public,authenticated,service_role;
    grant execute on function public.driver_only(),public.shared_name(uuid),public.shared_name(text) to authenticated;
    grant execute on function public.worker_only(),public.shared_name(text) to service_role;`);
  const roles = authorizationAudiences({
    authenticated: ['driver_only()', 'shared_name(uuid)', 'shared_name(text)'],
    serviceRole: ['worker_only()'],
    serviceRoleDenied: ['driver_only()', 'shared_name(uuid)'],
  });
  const openApi = {
    paths: {
      '/rpc/driver_only': { post: {} },
      '/rpc/worker_only': { post: {} },
      '/rpc/shared_name': { post: {} },
      '/table': { get: {} },
    },
  };
  assert.deepEqual(assertAdvertisedRpcSurface(openApi, roles.publicFunctions), {
    advertisedRpcNames: 3,
  });
  assert.throws(
    () => assertAdvertisedRpcSurface(openApi, roles.serviceExecutable),
    /Unexpected: driver_only/,
  );
  assert.deepEqual(
    (
      await db.query(`select
    has_function_privilege('service_role','public.driver_only()','EXECUTE') as driver,
    has_function_privilege('service_role','public.shared_name(uuid)','EXECUTE') as uuid_overload,
    has_function_privilege('service_role','public.shared_name(text)','EXECUTE') as text_overload`)
    ).rows,
    [{ driver: false, uuid_overload: false, text_overload: true }],
  );
  for (const name of ['driver_only', 'worker_only', 'shared_name']) {
    const paths = { ...openApi.paths };
    delete paths['/rpc/' + name];
    assert.throws(() => assertAdvertisedRpcSurface({ paths }, roles.publicFunctions), /Missing:/);
  }
  assert.throws(
    () =>
      assertAdvertisedRpcSurface(
        { paths: { ...openApi.paths, '/rpc/unreviewed': { post: {} } } },
        roles.publicFunctions,
      ),
    /Unexpected: unreviewed/,
  );
  for (const malformed of [null, {}, { paths: null }, { paths: [] }, { paths: 'unexpected' }])
    assert.throws(
      () => assertAdvertisedRpcSurface(malformed, roles.publicFunctions),
      /invalid OpenAPI/,
    );
});

test('the observed 18 advertised names are already reviewed and remain service-denied', async () => {
  const surface = JSON.parse(await fs.readFile('config/authorization-surface.json', 'utf8'));
  const roles = authorizationAudiences(surface);
  const paths = Object.fromEntries(
    [...roles.publicFunctions].map((signature) => [
      '/rpc/' + signature.slice(0, signature.indexOf('(')),
      { post: {} },
    ]),
  );
  assert.equal(surface.serviceRoleDenied.length, 18);
  assert.equal(
    assertAdvertisedRpcSurface({ paths }, roles.publicFunctions).advertisedRpcNames,
    Object.keys(paths).length,
  );
  for (const signature of surface.serviceRoleDenied)
    assert.equal(roles.serviceExecutable.has(signature), false);
});

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

test('audits retain authenticated driver access while denying service-role execution', async () => {
  const surface = await readJson('config/authorization-surface.json');
  const roles = authorizationAudiences(surface);
  const signature = 'authorize_driver_tracking_queue(text,text)';
  assert.ok(roles.authenticated.has(signature));
  assert.ok(roles.publicFunctions.has(signature));
  assert.equal(roles.serviceExecutable.has(signature), false);
  assert.equal(roles.serviceOnly.has(signature), false);
  assert.deepEqual(
    [...roles.serviceExecutable].sort(),
    [...roles.publicFunctions].filter((name) => !surface.serviceRoleDenied.includes(name)).sort(),
  );
  assert.throws(
    () => authorizationAudiences({ ...surface, serviceRoleDenied: ['unknown()'] }),
    /authenticated-only/,
  );
  assert.throws(
    () =>
      authorizationAudiences({
        ...surface,
        serviceRole: [...surface.serviceRole, signature],
      }),
    /authenticated-only/,
  );
});

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      ['node_modules', 'dist', 'build', 'coverage', '__tests__', 'tests', 'test'].includes(
        entry.name,
      )
    )
      continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else files.push(target);
  }
  return files;
}

test('authorization surface is exact, unique, and audience-separated', async () => {
  const surface = await readJson('config/authorization-surface.json');
  for (const audience of ['authenticated', 'serviceRole']) {
    assert.ok(Array.isArray(surface[audience]));
    assert.ok(surface[audience].length > 0);
    assert.deepEqual(surface[audience], [...surface[audience]].sort());
    assert.equal(new Set(surface[audience]).size, surface[audience].length);
  }
  const authenticated = new Set(surface.authenticated);
  for (const signature of surface.serviceRole) assert.equal(authenticated.has(signature), false);

  for (const studentQrRpc of [
    'get_admin_student_qr_credential_status(uuid)',
    'manage_student_qr_credential(uuid,text)',
    'resolve_student_qr_for_active_trip(text)',
  ]) {
    assert.equal(authenticated.has(studentQrRpc), true);
    assert.equal(surface.serviceRole.includes(studentQrRpc), false);
  }
  assert.ok(authenticated.has('record_student_qr_event_for_active_trip(text,text,uuid)'));
});

test('migration chain audiences match the reviewed authorization manifest', async () => {
  const laterMigrationPaths = (await fs.readdir('supabase/migrations'))
    .filter((name) => name.endsWith('.sql') && name > path.basename(migrationPath))
    .sort()
    .map((name) => path.join('supabase/migrations', name));
  const [surface, migration, laterMigrations, notificationMigration] = await Promise.all([
    readJson('config/authorization-surface.json'),
    fs.readFile(migrationPath, 'utf8'),
    Promise.all(laterMigrationPaths.map((file) => fs.readFile(file, 'utf8'))),
    fs.readFile(notificationMigrationPath, 'utf8'),
  ]);
  const allowlistInsert = migration.match(
    /insert into safebus_rpc_allowlist[\s\S]*?values([\s\S]*?);/i,
  )?.[1];
  assert.ok(allowlistInsert);
  const entries = [
    ...allowlistInsert.matchAll(/\('([a-z0-9_]+)', '(authenticated|service_role)'\)/g),
  ];
  const actual = new Map(entries.map((match) => [match[1], match[2]]));
  for (const laterMigration of laterMigrations) {
    for (const match of laterMigration.matchAll(
      /alter function public\.([a-z0-9_]+)\([^;]+\)\s+set schema safebus_private/gi,
    )) {
      actual.delete(match[1]);
    }
    for (const match of laterMigration.matchAll(
      /revoke (?:all|execute) on function public\.([a-z0-9_]+)\([^;]+\)\s+from (authenticated|service_role)/gi,
    )) {
      actual.delete(match[1]);
    }
    for (const match of laterMigration.matchAll(
      /grant execute on function public\.([a-z0-9_]+)\([^;]*\)\s+to (authenticated|service_role)/gi,
    )) {
      actual.set(match[1], match[2]);
    }
  }
  const notificationAllowlist = notificationMigration.match(
    /insert into safebus_notification_rpc_allowlist[\s\S]*?values([\s\S]*?);/i,
  )?.[1];
  assert.ok(notificationAllowlist);
  for (const match of notificationAllowlist.matchAll(
    /\('([a-z0-9_]+)',\s*'(authenticated|service_role)'\)/g,
  )) {
    actual.set(match[1], match[2]);
  }
  // The immutable chain remains historical. Only these three reviewed,
  // catalog-verified retirements change its current public surface.
  const observed = await readJson('config/observed/recipient-push-retirements.json');
  const reviewed = await readJson('config/pending/complete-recipient-push.json');
  assert.equal(observed.projectId, 'ckrkfylsyihwouvesypm');
  assert.equal(observed.migration, reviewed.migration);
  assert.equal(observed.migrationSha256, reviewed.migrationSha256);
  const evidence = await readJson(observed.verificationEvidence);
  assert.equal(evidence.migrationSha256, reviewed.migrationSha256);
  assert.equal(
    evidence.binding.projectRefHash,
    createHash('sha256').update(observed.projectId).digest('hex'),
  );
  assert.deepEqual(evidence.acceptance, {
    switchesRemoved: true,
    legacyRpcsRemoved: true,
    privacyConstraintRetained: true,
    reviewedDefinitionsMatched: 10,
    authorizationRetained: true,
  });
  assert.equal(evidence.firebaseValidationCompleted, true);
  assert.equal(evidence.notificationSent, false);
  assert.equal(evidence.sqlApplied, false);
  assert.equal(evidence.preChangeRecoveryCreated, false);
  assert.equal(
    createHash('sha256')
      .update((await fs.readFile(observed.migration, 'utf8')).replaceAll('\r\n', '\n'))
      .digest('hex'),
    observed.migrationSha256,
  );
  assert.deepEqual(observed.removedAuthenticated, [
    'get_tenant_notification_settings()',
    'set_tenant_notification_delivery_enabled(boolean)',
    'set_tenant_push_notifications_enabled(boolean)',
  ]);
  assert.deepEqual(observed.removedAuthenticated, reviewed.removedAuthenticated);
  assert.deepEqual(observed.verification, {
    readOnly: true,
    reviewedDefinitionsMatched: 10,
    protectedDeliveryTables: 6,
    anonymousAndAuthenticatedExecutionDenied: true,
    legacyColumns: 0,
    legacyRpcs: 0,
    legacyGates: 0,
  });
  for (const signature of observed.removedAuthenticated) {
    const name = signature.slice(0, signature.indexOf('('));
    assert.equal(actual.get(name), 'authenticated');
    actual.delete(name);
  }
  const tracking = await readJson('config/observed/tracking-queue-authorization.json');
  const trackingEvidence = await readJson(tracking.verificationEvidence);
  const trackingReview = await readJson('config/pending/tracking-queue-recovery.json');
  assert.equal(tracking.projectId, trackingReview.projectId);
  assert.equal(tracking.migration, trackingReview.migration);
  assert.equal(tracking.migrationSha256, trackingReview.migrationSha256);
  assert.equal(trackingEvidence.migrationSha256, tracking.migrationSha256);
  assert.equal(trackingEvidence.observationOnly, true);
  assert.equal(trackingEvidence.sqlApplied, false);
  assert.equal(trackingEvidence.preChangeRecoveryEvidenceEstablished, false);
  assert.equal(trackingEvidence.liveDriverRecoveryVerified, false);
  assert.equal(trackingEvidence.physicalDeviceVerified, false);
  assert.deepEqual(tracking.addedAuthenticated, ['authorize_driver_tracking_queue(text,text)']);
  for (const signature of tracking.deniedServiceRole)
    assert.ok(surface.serviceRoleDenied.includes(signature));
  assert.equal(
    createHash('sha256')
      .update((await fs.readFile(tracking.migration, 'utf8')).replaceAll('\r\n', '\n'))
      .digest('hex'),
    tracking.migrationSha256,
  );
  assert.equal(trackingEvidence.functions.length, trackingReview.functions.length);
  for (const reviewed of trackingReview.functions) {
    const live = trackingEvidence.functions.find((entry) => entry.signature === reviewed.signature);
    assert.equal(live.normalizedMd5, reviewed.after.md5);
    assert.equal(live.owner, reviewed.owner);
    assert.deepEqual(live.acl, reviewed.acl);
  }
  for (const signature of tracking.addedAuthenticated) {
    const name = signature.slice(0, signature.indexOf('('));
    assert.equal(actual.has(name), false);
    actual.set(name, 'authenticated');
  }
  const launch = await readJson('config/observed/launch-api-inventory.json');
  assert.equal(launch.projectId, tracking.projectId);
  assert.equal(launch.observationOnly, true);
  assert.equal(launch.sqlApplied, false);
  assert.equal(launch.installationProvenanceEstablished, false);
  assert.equal(launch.addedAuthenticated.length, 23);
  const offline = await readJson('config/observed/offline-trip-action-authorization.json');
  const offlineEvidence = await readJson(offline.verificationEvidence);
  assert.deepEqual(
    [...surface.serviceRoleDenied].sort(),
    [...launch.serviceRoleDenied, ...offline.deniedServiceRole].sort(),
  );
  for (const signature of launch.addedAuthenticated) {
    const observed = launch.functions.find((entry) => entry.signature === signature);
    assert.match(observed.normalizedMd5, /^[a-f0-9]{32}$/);
    assert.ok(observed.acl.includes('authenticated=X/postgres'));
    const name = signature.slice(0, signature.indexOf('('));
    assert.equal(actual.has(name), false);
    actual.set(name, 'authenticated');
  }
  assert.equal(launch.addedServiceRole.length, 17);
  for (const signature of launch.addedServiceRole) {
    const observed = launch.functions.find((entry) => entry.signature === signature);
    assert.match(observed.normalizedMd5, /^[a-f0-9]{32}$/);
    assert.deepEqual(observed.acl, ['postgres=X/postgres', 'service_role=X/postgres']);
    const name = signature.slice(0, signature.indexOf('('));
    assert.equal(actual.has(name), false);
    actual.set(name, 'service_role');
  }
  const audiences = authorizationAudiences(surface);
  const offlineFunctions = offlineEvidence.functions
    .filter((entry) =>
      offline.addedAuthenticated.includes(entry.signature.replace(/^public\./, '')),
    )
    .map((entry) => ({ ...entry, signature: entry.signature.replace(/^public\./, '') }));
  assert.equal(offlineFunctions.length, offline.addedAuthenticated.length);
  for (const signature of offline.addedAuthenticated) {
    const name = signature.slice(0, signature.indexOf('('));
    assert.equal(actual.has(name), false);
    actual.set(name, 'authenticated');
  }
  const observedFunctions = [...launch.functions, ...offlineFunctions];
  assert.deepEqual(
    observedFunctions.map((f) => f.signature).sort(),
    [...audiences.publicFunctions].sort(),
  );
  for (const entry of observedFunctions) {
    assert.equal(entry.owner, 'postgres');
    assert.equal(
      entry.acl.some((acl) => acl.startsWith('=') || acl.startsWith('anon=')),
      false,
    );
    assert.equal(
      entry.acl.includes('authenticated=X/postgres'),
      audiences.authenticated.has(entry.signature),
    );
    assert.equal(
      entry.acl.includes('service_role=X/postgres'),
      audiences.serviceExecutable.has(entry.signature),
    );
  }
  const expected = new Map();
  for (const signature of surface.authenticated) {
    expected.set(signature.slice(0, signature.indexOf('(')), 'authenticated');
  }
  for (const signature of surface.serviceRole) {
    expected.set(signature.slice(0, signature.indexOf('(')), 'service_role');
  }
  assert.deepEqual([...actual].sort(), [...expected].sort());
});

test('offline stop inventory is bound to protected installation, prior recovery and the observed driver-only grant', async () => {
  const observed = await readJson('config/observed/offline-trip-action-authorization.json');
  const evidence = await readJson(observed.verificationEvidence);
  const reviewed = await readJson('config/pending/offline-trip-actions.json');
  const active = await readJson('config/authorization-surface.json');
  const signature = 'apply_driver_trip_stop_action(uuid,text,timestamp with time zone,text)';
  assert.deepEqual(observed.addedAuthenticated, [signature]);
  assert.deepEqual(observed.deniedServiceRole, [signature]);
  assert.ok(active.authenticated.includes(signature));
  assert.ok(active.serviceRoleDenied.includes(signature));
  assert.equal(active.serviceRole.includes(signature), false);
  assert.equal(observed.projectId, reviewed.projectId);
  assert.equal(observed.migration, reviewed.migration);
  assert.equal(observed.migrationSha256, reviewed.migrationSha256);
  assert.equal(
    createHash('sha256')
      .update((await fs.readFile(observed.migration, 'utf8')).replaceAll('\r\n', '\n'))
      .digest('hex'),
    observed.migrationSha256,
  );
  assert.equal(observed.installationOrigin, 'protected-workflow');
  assert.equal(observed.preChangeRecoveryEvidenceEstablished, true);
  assert.equal(evidence.observationOnly, true);
  assert.equal(evidence.sqlApplied, false);
  assert.equal(evidence.installationProvenanceEstablished, true);
  assert.equal(evidence.preChangeRecoveryEvidenceEstablished, true);
  const installation = evidence.installation;
  assert.equal(installation.workflow, 'release-operational-fix.yml');
  assert.equal(installation.workflowRunId, '41866277317');
  assert.equal(
    installation.workflowRunUrl,
    `https://github.com/Davinder498/SafeBus-GLM/actions/runs/${installation.workflowRunId}`,
  );
  assert.equal(installation.releaseSha, '630ae69b60382c71b43a640a3d6cb6d3f81ef63e');
  assert.equal(installation.migrationSha256, reviewed.migrationSha256);
  assert.equal(installation.sqlApplied, true);
  assert.equal(installation.notificationSent, false);
  assert.ok(
    Date.parse(installation.recovery.createdAt) <= Date.parse(installation.recovery.uploadedAt),
  );
  assert.ok(Date.parse(installation.recovery.uploadedAt) <= Date.parse(installation.installedAt));
  assert.ok(Date.parse(installation.installedAt) <= Date.parse(installation.verifiedAt));
  assert.match(installation.recovery.ciphertextSha256, /^[a-f0-9]{64}$/);
  assert.equal(installation.recovery.boundedRecoveryOnly, true);
  assert.equal(installation.recovery.fullDatabaseRestoreVerified, false);
  assert.equal(evidence.functions.length, reviewed.functions.length);
  for (const expected of reviewed.functions) {
    const actual = evidence.functions.find((entry) => entry.signature === expected.signature);
    assert.equal(actual.normalizedMd5, expected.after.md5);
    assert.equal(actual.owner, expected.owner);
    assert.deepEqual(actual.acl, expected.acl);
  }
  const endpoint = evidence.functions.find((entry) => entry.signature === `public.${signature}`);
  assert.deepEqual(endpoint.acl, ['authenticated=X/postgres', 'postgres=X/postgres']);
  assert.equal(evidence.catalogComparison.applicationFunctions, 220);
  assert.equal(evidence.catalogComparison.previouslyKnownFunctions, 219);
  const prior = await readJson('config/observed/launch-api-inventory.json');
  assert.equal(
    evidence.catalogComparison.existingDefinitionFingerprintsCompared,
    prior.functions.filter((entry) => entry.normalizedMd5).length,
  );
  assert.equal(evidence.catalogComparison.unchangedGuardFunctionsVerified, 8);
  for (const key of ['unexpectedFunctions', 'missingFunctions', 'changedExistingDefinitionsOrAcls'])
    assert.deepEqual(evidence.catalogComparison[key], []);
  assert.equal(evidence.catalogComparison.anonymousExecutionGrants, 0);
  assert.equal(evidence.physicalDeviceVerified, false);
  assert.equal(evidence.liveStopReplayInvoked, false);
  assert.equal(evidence.externalNotificationSent, false);
});

test('production application RPC references are all reviewed', async () => {
  const surface = await readJson('config/authorization-surface.json');
  // Prepared source can reference an explicitly reviewed forward surface. This
  // does not add it to the active installation/audit manifest or authorize DDL.
  const pending = await Promise.all([
    readJson('config/pending/tenant-subscription-authorization.json'),
    readJson('config/pending/pricing-catalog-authorization.json'),
    readJson('config/pending/student-seat-authorization.json'),
    readJson('config/pending/data-download-authorization.json'),
    readJson('config/pending/trip-notification-authorization.json'),
    readJson('config/pending/authority-directory-authorization.json'),
    readJson('config/pending/admin-trip-detail-authorization.json'),
    readJson('config/pending/unified-notification-authorization.json'),
  ]);
  const approved = new Set(
    [
      ...surface.authenticated,
      ...surface.serviceRole,
      ...pending.flatMap((surface) => [...surface.authenticated, ...surface.serviceRole]),
    ].map((entry) => entry.slice(0, entry.indexOf('('))),
  );
  const referenced = new Set();
  const sourceRoots = [
    'apps/web/src',
    'apps/web/netlify',
    'apps/mobile/src',
    'apps/mobile/android/app/src/main/java',
  ];
  for (const file of (await Promise.all(sourceRoots.map((root) => walk(root)))).flat()) {
    if (!/\.(?:[cm]?[jt]sx?|java)$/.test(file)) continue;
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = await fs.readFile(file, 'utf8');
    for (const match of source.matchAll(/\.rpc\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
      referenced.add(match[1]);
    }
    for (const match of source.matchAll(/\/rpc\/([a-zA-Z0-9_]+)/g)) referenced.add(match[1]);
    for (const match of source.matchAll(/\brpc\(\s*(?:ctx\.)?admin,\s*['"]([a-zA-Z0-9_]+)['"]/g))
      referenced.add(match[1]);
  }
  for (const dynamicName of [
    'cancel_guardian_notification_email',
    'complete_guardian_notification_email',
    'fail_guardian_notification_email',
    'mark_student_dropped_off_for_active_trip',
    'mark_student_picked_up_for_active_trip',
    'retry_guardian_notification_email',
    'search_admin_buses',
    'search_admin_guardians',
    'search_admin_routes',
    'tenant_add_sub_administrator',
    'tenant_invite_administrator',
  ]) {
    referenced.add(dynamicName);
  }
  assert.deepEqual(
    [...referenced].filter((name) => !approved.has(name)),
    [],
  );
});

test('prepared billing surfaces enter active scope only with catalog observation', async () => {
  const active = await readJson('config/authorization-surface.json');
  const observed = await readJson('config/observed/launch-api-inventory.json');
  for (const file of [
    'config/pending/tenant-subscription-authorization.json',
    'config/pending/pricing-catalog-authorization.json',
  ]) {
    const pending = await readJson(file);
    assert.equal(pending.status, 'prepared-unapplied');
    assert.ok(pending.migration.startsWith('supabase/migrations/pending/'));
    await fs.access(pending.migration);
    for (const audience of ['authenticated', 'serviceRole']) {
      assert.deepEqual(pending[audience], [...new Set(pending[audience])].sort());
      for (const signature of pending[audience]) {
        if (observed.addedAuthenticated.includes(signature)) {
          assert.equal(audience, 'authenticated');
          assert.ok(active.authenticated.includes(signature));
        } else if (observed.addedServiceRole.includes(signature)) {
          assert.equal(audience, 'serviceRole');
          assert.ok(active.serviceRole.includes(signature));
        } else assert.ok(![...active.authenticated, ...active.serviceRole].includes(signature));
      }
    }
  }
});

test('hardening migration removes spare keys and hides internal routines', async () => {
  const migration = await fs.readFile(migrationPath, 'utf8');
  for (const required of [
    /create schema if not exists safebus_private/i,
    /alter function %s set schema safebus_private/i,
    /revoke execute on all functions in schema public from public, anon, authenticated, service_role/i,
    /revoke all on all tables in schema public from anon, authenticated/i,
    /revoke all on all sequences in schema public from anon, authenticated/i,
    /alter default privileges for role postgres in schema public[\s\S]*revoke all on tables/i,
    /alter default privileges for role postgres in schema public[\s\S]*revoke execute on functions/i,
    /create event trigger safebus_enable_public_table_rls/i,
    /set local search_path = pg_catalog, public, safebus_private, auth, extensions, realtime, pg_temp/i,
    /alter function %s set search_path = pg_catalog, public, safebus_private, auth, extensions, realtime, pg_temp/i,
    /user_metadata\|raw_user_meta_data/i,
  ]) {
    assert.match(migration, required);
  }
  assert.doesNotMatch(migration, /grant\s+execute[^;]+\bto\s+anon\b/i);
  assert.doesNotMatch(migration, /grant\s+(?:all|select|insert|update|delete)[^;]+\bto\s+anon\b/i);
});

test('student QR promotion retains private storage and current manifest authorization', async () => {
  const migration = await fs.readFile(
    'supabase/migrations/0119_student_qr_pickup_dropoff.sql',
    'utf8',
  );
  assert.match(migration, /alter table public\.student_qr_credentials enable row level security/i);
  assert.match(
    migration,
    /revoke all on public\.student_qr_credentials from public, anon, authenticated, service_role/i,
  );
  assert.match(migration, /can_write_student_roster\(s\.tenant_id, s\.school_id\)/);
  assert.match(migration, /public\.get_driver_active_trip_student_manifest\(\)/);
  assert.doesNotMatch(migration, /student_route_assignments/);
  assert.match(migration, /dt\.id = p_driver_trip_id/);
  assert.match(
    migration,
    /perform record_student_trip_event_for_active_trip\(v_context\.student_id, p_event_type\)/,
  );
  assert.match(
    migration,
    /p_event_type = 'picked_up' and v_context\.student_trip_status = 'picked_up'[\s\S]*?v_outcome := 'already_recorded'/,
  );
  assert.match(
    migration,
    /revoke all on function safebus_private\.student_qr_context\(text, uuid\) from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:drop table|disable (?:trigger|row level security)|grant[^;]+to anon)\b/i,
  );
  const fixture = await fs.readFile('tests/rls/student-qr-pickup-dropoff-rls.sql', 'utf8');
  assert.match(fixture, /id uuid not null default gen_random_uuid\(\)/);
  assert.match(fixture, /rollback;\s*$/i);
  assert.doesNotMatch(fixture, /\b(?:commit;|disable trigger|delete from)\b/i);
});

test('authorization audit is read-only and is a protected release gate', async () => {
  const [audit, workflow, preflight] = await Promise.all([
    fs.readFile('scripts/audit-database-authorization.mjs', 'utf8'),
    fs.readFile('.github/workflows/authorization-audit.yml', 'utf8'),
    fs.readFile('scripts/run-release-preflight.mjs', 'utf8'),
  ]);
  assert.match(audit, /begin transaction read only/i);
  assert.match(audit, /assertEnvironmentIdentity/);
  assert.match(audit, /GITHUB_ACTIONS/);
  assert.match(audit, /application\/openapi\+json/);
  assert.doesNotMatch(
    audit,
    /\b(?:insert|update|delete|alter|create|drop|grant|revoke)\s+(?:into|table|schema|function|on)\b/i,
  );
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /pnpm authorization:audit/);
  assert.match(preflight, /await run\('authorization:audit'\)/);
});
