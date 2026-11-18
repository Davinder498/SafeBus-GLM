// Owner-approved recovery-only exception. Never use this for customer disposal.
export async function cleanupRecoveryProfiles(
  db,
  { run, emails, tenantIds, tenantNames, rehearse = false },
) {
  if (
    typeof rehearse !== 'boolean' ||
    !/^\d+-\d+$/.test(run) ||
    emails.length !== 7 ||
    tenantIds.length !== 2 ||
    tenantNames.length !== 2 ||
    emails.some((email, i) => email !== `capacity-api-${run}-${i}@example.test`) ||
    tenantNames.some((name, i) => name !== `Capacity API ${run} ${i}`)
  )
    throw Error('CLEANUP_SCOPE_INVALID');
  await db.query('begin');
  try {
    await db.query("set local lock_timeout='2s'");
    await db.query("set local statement_timeout='15s'");
    await db.query('lock table public.profiles, public.tenants in access exclusive mode');
    const guard = (
      await db.query(
        `select
      exists(select 1 from safebus_release.environment_identity where singleton and environment='staging'
        and project_ref_hash=encode(sha256(convert_to('deladookciebwvqojhkv','UTF8')),'hex')) identity,
      exists(select 1 from unnest(array['anon','authenticated','service_role']) r
        where has_schema_privilege(r,'public','USAGE') or has_schema_privilege(r,'safebus_private','USAGE')) exposed,
      exists(select 1 from public.profiles p where not exists(select 1 from auth.users u where u.id=p.id
        and u.raw_app_meta_data->>'safebus_capacity_run'=$1 and u.email=any($2::text[]))) foreign_profiles,
      exists(select 1 from public.tenants t where not exists(select 1 from unnest($3::uuid[],$4::text[]) x(id,name)
        where t.id=x.id and t.name=x.name and t.type::text='demo')) foreign_tenants`,
        [run, emails, tenantIds, tenantNames],
      )
    ).rows[0];
    if (!guard.identity || guard.exposed || guard.foreign_profiles || guard.foreign_tenants)
      throw Error('CLEANUP_GUARD_FAILED');
    const guards = (
      await db.query(`select tgname,tgenabled from pg_trigger where tgrelid='public.profiles'::regclass
      and tgname in ('complete_disposal_guard','protect_final_tenant_admin_delete') order by tgname`)
    ).rows;
    if (guards.length !== 2 || guards.some((g) => g.tgenabled !== 'O'))
      throw Error('DELETE_GUARDS_CHANGED');
    const ids = (
      await db.query(
        "select id from auth.users where raw_app_meta_data->>'safebus_capacity_run'=$1 and email=any($2::text[])",
        [run, emails],
      )
    ).rows.map((r) => r.id);
    if (ids.length > 7) throw Error('CLEANUP_SCOPE_INVALID');
    await db.query(
      'delete from safebus_private.participant_agreement_requirements where profile_id=any($1::uuid[])',
      [ids],
    );
    await db.query('alter table public.profiles disable trigger complete_disposal_guard');
    await db.query('alter table public.profiles disable trigger protect_final_tenant_admin_delete');
    await db.query('delete from public.profiles where id=any($1::uuid[])', [ids]);
    await db.query('alter table public.profiles enable trigger complete_disposal_guard');
    await db.query('alter table public.profiles enable trigger protect_final_tenant_admin_delete');
    await db.query(
      'delete from safebus_private.tenant_agreement_requirement where tenant_id=any($1::uuid[])',
      [tenantIds],
    );
    await db.query('delete from public.tenants where id=any($1::uuid[])', [tenantIds]);
    const remaining = (
      await db.query(`select
      (select count(*) from public.profiles)::int profiles,
      (select count(*) from public.tenants)::int tenants,
      (select count(*) from pg_trigger where tgrelid='public.profiles'::regclass
       and tgname in ('complete_disposal_guard','protect_final_tenant_admin_delete') and tgenabled='O')::int guards`)
    ).rows[0];
    if (remaining.profiles || remaining.tenants || remaining.guards !== 2)
      throw Error('CLEANUP_INCOMPLETE');
    await db.query(rehearse ? 'rollback' : 'commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
