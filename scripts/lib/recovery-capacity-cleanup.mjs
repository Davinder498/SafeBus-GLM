// Explicit owner approval, 2026-11-18. Recovery synthetic fixtures only.
export const capacityTables = [
  'guardian_notification_outbox',
  'push_notification_outbox',
  'user_notifications',
  'audit_events',
  'bus_tracking_sessions',
  'driver_trip_current_locations',
  'driver_tracking_devices',
  'driver_trips',
  'student_bus_assignments',
  'student_route_assignments',
  'student_guardians',
  'students',
  'guardians',
  'drivers',
  'bus_qr_credentials',
  'bus_route_assignments',
  'route_stops',
  'route_trip_patterns',
  'routes',
  'buses',
  'profiles',
];
export const capacityGuards = [
  ...[
    'guardian_notification_outbox',
    'push_notification_outbox',
    'user_notifications',
    'audit_events',
    'bus_tracking_sessions',
    'driver_trips',
    'student_guardians',
    'students',
    'guardians',
    'drivers',
    'profiles',
  ].map((t) => [t, 'complete_disposal_guard']),
  ...[
    'guardian_notification_outbox',
    'push_notification_outbox',
    'user_notifications',
    'driver_trips',
  ].map((t) => [t, 'retention_source_guard']),
  ['profiles', 'protect_final_tenant_admin_delete'],
];
export function capacityAccountCount(buses) {
  if (buses === 5000) return buses;
  return [10, 100, 500].includes(buses) ? buses + 51 : 0;
}
export function assertCapacityScope(s) {
  if (
    !/^\d+-\d+$/.test(s.run) ||
    !capacityAccountCount(s.buses) ||
    s.emails.length !== capacityAccountCount(s.buses) ||
    s.tenantIds.length !== 2 ||
    new Set(s.tenantIds).size !== 2 ||
    s.tenantIds.some((id) => !/^[0-9a-f-]{36}$/.test(id)) ||
    s.emails.some((e, i) => e !== `capacity-load-${s.run}-${i}@example.test`)
  )
    throw Error('CAPACITY_SCOPE_INVALID');
}
export async function capacityQuarantine(db) {
  if (
    (
      await db.query(`select 1 from unnest(array['anon','authenticated','service_role']) r
    where has_schema_privilege(r,'public','USAGE') or has_schema_privilege(r,'safebus_private','USAGE')`)
    ).rows.length
  )
    throw Error('CAPACITY_API_EXPOSED');
}
export async function cleanupCapacity(db, scope, rehearse = false) {
  assertCapacityScope(scope);
  await db.query('begin');
  try {
    await db.query("set local lock_timeout='2s'");
    await db.query("set local statement_timeout='20s'");
    await db.query(
      `lock table public.tenants, ${capacityTables.map((t) => 'public.' + t).join(',')},
        safebus_private.driver_tracking_state in access exclusive mode`,
    );
    await capacityQuarantine(db);
    const g = (
      await db.query(
        `select
      exists(select 1 from safebus_release.environment_identity where singleton and environment='staging'
        and project_ref_hash=encode(sha256(convert_to('deladookciebwvqojhkv','UTF8')),'hex')) identity,
      exists(select 1 from public.tenants where not(id=any($1::uuid[])) or type<>'demo'
        or name is distinct from 'Capacity Load '||$2||' '||array_position($1::uuid[],id)::text) foreign_tenants,
      exists(select 1 from public.profiles p where not exists(select 1 from auth.users u where u.id=p.id
        and u.raw_app_meta_data->>'safebus_capacity_run'=$2 and u.email=any($3::text[]))) foreign_profiles`,
        [scope.tenantIds, scope.run, scope.emails],
      )
    ).rows[0];
    if (!g.identity || g.foreign_tenants || g.foreign_profiles)
      throw Error('CAPACITY_CLEANUP_OWNERSHIP');
    // Every deleted domain row must belong to the two exact run-owned tenants.
    for (const table of capacityTables)
      if (
        (
          await db.query(
            `select 1 from public.${table} where tenant_id is null or not(tenant_id=any($1::uuid[])) limit 1`,
            [scope.tenantIds],
          )
        ).rows.length
      )
        throw Error('CAPACITY_FOREIGN_ROWS');
    for (const [table, guard] of capacityGuards) {
      const found = (
        await db.query(
          'select tgenabled from pg_trigger where tgrelid=$1::regclass and tgname=$2',
          ['public.' + table, guard],
        )
      ).rows;
      if (found.length !== 1 || found[0].tgenabled !== 'O') throw Error('CAPACITY_GUARD_DRIFT');
    }
    for (const [table, guard] of capacityGuards)
      await db.query(`alter table public.${table} disable trigger ${guard}`);
    // All identifiers are fixed in this reviewed file, never provider/user input.
    await db.query(
      'delete from safebus_private.notification_audience_queue where tenant_id=any($1::uuid[])',
      [scope.tenantIds],
    );
    for (const table of capacityTables) {
      if (table === 'profiles') {
        await db.query(
          'delete from safebus_private.agreement_packages where tenant_id=any($1::uuid[])',
          [scope.tenantIds],
        );
        await db.query(
          'delete from safebus_private.participant_agreement_requirements where profile_id in (select id from public.profiles where tenant_id=any($1::uuid[]))',
          [scope.tenantIds],
        );
      }
      await db.query(`delete from public.${table} where tenant_id=any($1::uuid[])`, [
        scope.tenantIds,
      ]);
    }
    await db.query(
      'delete from safebus_private.tenant_agreement_requirement where tenant_id=any($1::uuid[])',
      [scope.tenantIds],
    );
    await db.query('delete from public.tenants where id=any($1::uuid[])', [scope.tenantIds]);
    for (const [table, guard] of capacityGuards) {
      await db.query(`alter table public.${table} enable trigger ${guard}`);
      if (
        (
          await db.query(
            'select tgenabled from pg_trigger where tgrelid=$1::regclass and tgname=$2',
            ['public.' + table, guard],
          )
        ).rows[0]?.tgenabled !== 'O'
      )
        throw Error('CAPACITY_RESTORE_FAILED');
    }
    for (const table of [
      ...['tenants', ...capacityTables].map((name) => 'public.' + name),
      'safebus_private.driver_tracking_state',
    ])
      if ((await db.query(`select 1 from ${table} limit 1`)).rows.length)
        throw Error('CAPACITY_CLEANUP_INCOMPLETE');
    await db.query(rehearse ? 'rollback' : 'commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
