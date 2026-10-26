import { createHash } from 'node:crypto';

export const SWITCHES = [
  'notifications_enabled',
  'push_notifications_enabled',
  'push_delivery_preference_enabled',
];
export const LEGACY_RPCS = [
  'public.get_tenant_notification_settings()',
  'public.set_tenant_notification_delivery_enabled(boolean)',
  'public.set_tenant_push_notifications_enabled(boolean)',
];
export const digest = (value) => createHash('sha256').update(value).digest('hex');
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';

export async function capturePushRecovery(client, signatures) {
  const definitions = [];
  for (const signature of [...signatures].sort()) {
    const {
      rows: [row],
    } = await client.query(
      `select replace(pg_get_functiondef(to_regprocedure($1)),chr(13),'') as definition,
      coalesce(proacl,acldefault('f',proowner))::text[] as acl from pg_proc where oid=to_regprocedure($1)`,
      [signature],
    );
    if (!row?.definition) throw new Error('Notification function baseline is missing.');
    definitions.push({ signature, ...row, acl: [...row.acl].sort() });
  }
  const { rows: policies } = await client.query(`select tenant_id::text, notifications_enabled,
    push_notifications_enabled, push_delivery_preference_enabled
    from public.guardian_notification_delivery_policies order by tenant_id`);
  const { rows: columns } = await client.query(
    `select column_name, data_type, is_nullable, column_default
    from information_schema.columns where table_schema='public' and table_name='guardian_notification_delivery_policies'
    and column_name=any($1::text[]) order by column_name`,
    [SWITCHES],
  );
  if (
    columns.length !== 3 ||
    policies.length > 10_000 ||
    columns.some(
      (column) =>
        column.data_type !== 'boolean' || ![null, 'true', 'false'].includes(column.column_default),
    )
  )
    throw new Error('Notification recovery scope differs.');
  const {
    rows: [constraint],
  } = await client.query(`select pg_get_constraintdef(oid) as definition
    from pg_constraint where conrelid='public.guardian_notification_delivery_policies'::regclass
    and conname='guardian_notification_policy_approval_check'`);
  if (!constraint?.definition) throw new Error('Notification approval constraint is missing.');
  return { format: 1, definitions, policies, columns, approvalConstraint: constraint.definition };
}

export function pushRecoverySql(snapshot) {
  if (
    snapshot.format !== 1 ||
    !Array.isArray(snapshot.definitions) ||
    !Array.isArray(snapshot.policies) ||
    !Array.isArray(snapshot.columns) ||
    snapshot.columns.length !== 3
  )
    throw new Error('Invalid notification recovery snapshot.');
  const statements = [
    'alter table public.guardian_notification_delivery_policies drop constraint guardian_notification_policy_approval_check;',
    ...snapshot.columns.map((column) => {
      if (
        !SWITCHES.includes(column.column_name) ||
        ![null, 'true', 'false'].includes(column.column_default)
      )
        throw new Error('Invalid recovery column.');
      return `alter table public.guardian_notification_delivery_policies add column ${column.column_name} boolean${column.column_default === null ? '' : ' default ' + column.column_default};`;
    }),
  ];
  for (const row of snapshot.policies) {
    if (
      !/^[a-f0-9-]{36}$/.test(row.tenant_id) ||
      SWITCHES.some((name) => typeof row[name] !== 'boolean')
    )
      throw new Error('Invalid notification recovery values.');
    statements.push(
      `update public.guardian_notification_delivery_policies set ${SWITCHES.map((name) => `${name}=${row[name]}`).join(',')} where tenant_id='${row.tenant_id}'::uuid;`,
    );
  }
  for (const column of snapshot.columns)
    if (column.is_nullable === 'NO')
      statements.push(
        `alter table public.guardian_notification_delivery_policies alter column ${column.column_name} set not null;`,
      );
  statements.push(
    `alter table public.guardian_notification_delivery_policies add constraint guardian_notification_policy_approval_check ${snapshot.approvalConstraint};`,
  );
  for (const fn of snapshot.definitions) {
    statements.push(fn.definition.trimEnd().replace(/;?$/, ';'));
    const grants = fn.acl.map((acl) => {
      const match = /^([^=]*)=([^/]*)\//.exec(acl);
      if (!match || !/^X\*?$/.test(match[2]))
        throw new Error('Unexpected notification function ACL.');
      return {
        role: match[1] === '' ? 'PUBLIC' : quote(match[1].replace(/^"|"$/g, '')),
        grant: match[2].includes('*'),
      };
    });
    statements.push(
      `revoke all on function ${fn.signature} from PUBLIC, anon, authenticated, service_role;`,
    );
    for (const grant of grants)
      statements.push(
        `grant execute on function ${fn.signature} to ${grant.role}${grant.grant ? ' with grant option' : ''};`,
      );
  }
  return statements.join('\n') + '\n';
}

export async function verifyRecipientPushSchema(client) {
  const {
    rows: [result],
  } = await client.query(
    `select
    (select count(*)::int from information_schema.columns where table_schema='public'
      and table_name='guardian_notification_delivery_policies' and column_name=any($1::text[])) as switches,
    (select count(*)::int from unnest($2::text[]) s where to_regprocedure(s) is not null) as legacy_rpcs,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','safebus_private') and p.prokind='f'
      and pg_get_functiondef(p.oid) ~ 'notifications_enabled|push_delivery_preference_enabled') as legacy_gates,
    (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.guardian_notification_delivery_policies'::regclass
      and conname='guardian_notification_policy_approval_check') as approval_constraint`,
    [SWITCHES, LEGACY_RPCS],
  );
  if (
    result.switches !== 0 ||
    result.legacy_rpcs !== 0 ||
    result.legacy_gates !== 0 ||
    !result.approval_constraint?.includes('privacy_approved_at IS NOT NULL')
  )
    throw new Error('Recipient push schema acceptance failed.');
  return { switchesRemoved: true, legacyRpcsRemoved: true, privacyConstraintRetained: true };
}

export async function recipientPreferenceDigest(client) {
  const {
    rows: [row],
  } = await client.query(`select md5(jsonb_build_object(
    'settings',(select jsonb_agg(to_jsonb(s) order by profile_id) from public.user_notification_settings s),
    'categories',(select jsonb_agg(to_jsonb(c) order by profile_id,category) from public.user_notification_category_preferences c),
    'student_preferences',(select jsonb_agg(to_jsonb(g) order by student_guardian_id,category) from public.guardian_student_push_preferences g)
    )::text) as digest`);
  return row.digest;
}

export async function rehearseRecipientPush(client, migration, signatures) {
  await client.query('begin isolation level repeatable read');
  let before;
  try {
    await client.query("set local statement_timeout='5s'; set local lock_timeout='1s'");
    before = await capturePushRecovery(client, signatures);
    const preferences = await recipientPreferenceDigest(client);
    await client.query(migration);
    const acceptance = await verifyRecipientPushSchema(client);
    if (preferences !== (await recipientPreferenceDigest(client)))
      throw new Error('Recipient preferences changed.');
    return acceptance;
  } finally {
    await client.query('rollback');
    // Reading the original signatures proves transactional restoration of the
    // dropped RPCs as well as the updated delivery helpers.
    await client.query('begin transaction read only');
    try {
      await client.query("set local statement_timeout='5s'; set local lock_timeout='1s'");
      const restored = await capturePushRecovery(client, signatures);
      if (before && digest(JSON.stringify(before)) !== digest(JSON.stringify(restored)))
        throw new Error('Notification rehearsal did not restore its baseline.');
    } finally {
      await client.query('rollback');
    }
  }
}
