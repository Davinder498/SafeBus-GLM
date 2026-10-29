import { recipientPreferenceDigest } from './recipient-push-rollout.mjs';
import {
  templateDefinitions,
  templateDigest,
  templateReadOnly,
} from './notification-template-rollout.mjs';

export { templateDigest, templateReadOnly };

const signatures = (config) =>
  [...config.baseline.map((f) => f.signature), ...config.newFunctions].sort();

export async function verifyTemplateDependencies(client, config) {
  for (const signature of config.authenticationDependencies) {
    const {
      rows: [row],
    } = await client.query('select to_regprocedure($1) is not null as present', [signature]);
    if (!row.present) throw new Error('TEMPLATE_AUTH_DEPENDENCY_MISSING');
  }
  for (const expected of config.baseline) {
    const {
      rows: [row],
    } = await client.query(
      "select coalesce(proacl,acldefault('f',proowner))::text[] as acl from pg_proc where oid=to_regprocedure($1)",
      [expected.signature],
    );
    if (JSON.stringify(row?.acl?.sort()) !== JSON.stringify([...expected.acl].sort()))
      throw new Error('TEMPLATE_ACL_CHANGED');
  }
  const {
    rows: [trigger],
  } = await client.query(
    "select tgname as name,pg_get_triggerdef(oid) as definition,tgenabled as enabled from pg_trigger where tgrelid='public.student_trip_events'::regclass and tgname=$1",
    [config.sourceTrigger.name],
  );
  if (JSON.stringify(trigger) !== JSON.stringify(config.sourceTrigger))
    throw new Error('TEMPLATE_TRIGGER_DRIFT');
}

export async function templateSnapshot(client, config) {
  const functions = [];
  for (const signature of signatures(config)) {
    const {
      rows: [row],
    } = await client.query(
      `select replace(pg_get_functiondef(oid),chr(13),'') as definition,
      coalesce(proacl,acldefault('f',proowner))::text[] as acl from pg_proc where oid=to_regprocedure($1)`,
      [signature],
    );
    functions.push({
      signature,
      definition: row?.definition ?? null,
      acl: row?.acl?.sort() ?? null,
    });
  }
  const {
    rows: [table],
  } = await client.query(`select c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
    coalesce(c.relacl,acldefault('r',c.relowner))::text[] as acl,
    (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull) order by a.attnum)
      from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
    (select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid and k.contype<>'n') as constraints,
    (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies,
    (select count(*)::int from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
    from pg_class c where c.oid=to_regclass('safebus_private.pickup_dropoff_event_copies')`);
  return { functions, table: table ?? null };
}

export async function verifyTemplateInstallation(client, sql, config, recovery = null) {
  await verifyTemplateDependencies(client, config);
  const snapshot = await templateSnapshot(client, config);
  for (const expected of templateDefinitions(sql, config)) {
    const actual = snapshot.functions.find((f) => f.signature === expected.signature);
    if (
      !actual?.definition ||
      templateDefinitions(actual.definition.trim().replace(/;?$/, ';'), {
        baseline: [{ signature: expected.signature }],
        newFunctions: [],
      })[0].definition !== expected.definition
    )
      throw new Error('TEMPLATE_INSTALLED_DRIFT');
    const acl =
      recovery?.functions.find((f) => f.signature === expected.signature)?.acl ??
      config.baseline.find((f) => f.signature === expected.signature)?.acl ??
      config.newFunctionAcls[expected.signature];
    if (JSON.stringify([...acl].sort()) !== JSON.stringify(actual.acl))
      throw new Error('TEMPLATE_ACL_CHANGED');
  }
  if (JSON.stringify(snapshot.table) !== JSON.stringify(config.table))
    throw new Error('TEMPLATE_TABLE_DRIFT');
  return { definitionsMatched: snapshot.functions.length, privateEventCopy: true };
}

export function templateRestoreSql(snapshot) {
  // Retain the private table: notifications created after installation must not lose their saved copy.
  return [
    ...snapshot.functions
      .filter((f) => f.definition)
      .map((f) => f.definition.trim().replace(/;$/, '') + ';'),
    'DROP FUNCTION public.resolve_guardian_pickup_dropoff_email_payload(uuid);',
    'DROP FUNCTION safebus_private.pickup_dropoff_event_copy(uuid,uuid,uuid,uuid,text);',
  ].join('\n');
}

export async function rehearseTemplates(client, sql, config) {
  await templateReadOnly(client, () => verifyTemplateDependencies(client, config));
  const before = await templateReadOnly(client, () => templateSnapshot(client, config));
  let acceptance;
  await client.query('begin isolation level repeatable read');
  try {
    await client.query(
      "set local statement_timeout='5s';set local lock_timeout='1s';set local check_function_bodies=on",
    );
    const preferences = await recipientPreferenceDigest(client);
    await client.query(sql);
    acceptance = await verifyTemplateInstallation(client, sql, config, before);
    if (preferences !== (await recipientPreferenceDigest(client)))
      throw new Error('TEMPLATE_PREFERENCES_CHANGED');
  } finally {
    await client.query('rollback');
    const restored = await templateReadOnly(client, () => templateSnapshot(client, config));
    if (templateDigest(JSON.stringify(before)) !== templateDigest(JSON.stringify(restored)))
      throw new Error('TEMPLATE_RESTORATION_FAILED');
  }
  return acceptance;
}
