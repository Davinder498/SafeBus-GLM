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

const normalizeDefinition = (value) =>
  value.replaceAll('\r\n', '\n').trim().replace(/;$/, '').trimEnd();

export function reviewedPushDefinitions(migration, baseline) {
  const definitions = [
    ...migration.matchAll(/CREATE OR REPLACE FUNCTION ([a-z_]+\.[a-z_]+)\([\s\S]*?\$function\$;/g),
  ].map((match) => ({
    signature: baseline.find((entry) => entry.signature.startsWith(match[1] + '('))?.signature,
    definition: normalizeDefinition(match[0]),
  }));
  if (
    definitions.length !== 10 ||
    definitions.some((entry) => !entry.signature) ||
    new Set(definitions.map((entry) => entry.signature)).size !== 10
  )
    throw new Error('Reviewed notification definitions are invalid.');
  return definitions;
}

export async function verifyInstalledRecipientPush(client, migration, baseline) {
  const definitions = reviewedPushDefinitions(migration, baseline);
  for (const expected of definitions) {
    const {
      rows: [actual],
    } = await client.query('select pg_get_functiondef(to_regprocedure($1)) as definition', [
      expected.signature,
    ]);
    if (!actual?.definition || normalizeDefinition(actual.definition) !== expected.definition)
      throw new Error('Installed notification definitions differ from reviewed SQL.');
  }
  const {
    rows: [security],
  } = await client.query(
    `select
    (select count(*)::int from unnest($1::text[]) s
      where has_function_privilege('anon',to_regprocedure(s),'execute')
        or has_function_privilege('authenticated',to_regprocedure(s),'execute')) as exposed_functions,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any($2::text[]) and c.relrowsecurity) as protected_tables`,
    [
      definitions.map((entry) => entry.signature),
      [
        'guardian_notification_delivery_policies',
        'android_push_devices',
        'push_notification_outbox',
        'user_notification_settings',
        'user_notification_category_preferences',
        'guardian_student_push_preferences',
      ],
    ],
  );
  if (security.exposed_functions !== 0 || security.protected_tables !== 6)
    throw new Error('Installed notification authorization differs from reviewed policy.');
  return {
    ...(await verifyRecipientPushSchema(client)),
    reviewedDefinitionsMatched: 10,
    authorizationRetained: true,
  };
}

export async function recipientPushState(client, migration, baseline) {
  const {
    rows: [state],
  } = await client.query(
    `select
    (select count(*)::int from information_schema.columns where table_schema='public'
      and table_name='guardian_notification_delivery_policies' and column_name=any($1::text[])) as switches,
    (select count(*)::int from unnest($2::text[]) s where to_regprocedure(s) is not null) as legacy_rpcs`,
    [SWITCHES, LEGACY_RPCS],
  );
  if (state.switches === 3 && state.legacy_rpcs === 3) return 'pending';
  if (state.switches === 0 && state.legacy_rpcs === 0) {
    await verifyInstalledRecipientPush(client, migration, baseline);
    return 'installed';
  }
  throw new Error('Notification schema is partially installed.');
}

export function recipientPushFailureCode(error) {
  const known = new Map([
    ['Notification schema is partially installed.', 'PARTIAL_INSTALLATION'],
    ['Installed notification definitions differ from reviewed SQL.', 'INSTALLED_DEFINITION_DRIFT'],
    [
      'Installed notification authorization differs from reviewed policy.',
      'INSTALLED_AUTHORIZATION_DRIFT',
    ],
    ['Reviewed notification definitions are invalid.', 'REVIEWED_DEFINITION_INVALID'],
    ['Notification function baseline is missing.', 'BASELINE_FUNCTION_MISSING'],
    ['Notification recovery scope differs.', 'RECOVERY_SCOPE_MISMATCH'],
    ['Recipient push schema acceptance failed.', 'SCHEMA_ACCEPTANCE_FAILED'],
    ['Recipient preferences changed.', 'RECIPIENT_PREFERENCES_CHANGED'],
    ['Notification rehearsal did not restore its baseline.', 'REHEARSAL_RESTORATION_FAILED'],
  ]);
  if (known.has(error?.message)) return known.get(error.message);
  if (error?.code === '55P03') return 'LOCK_TIMEOUT';
  if (error?.code === '57014') return 'STATEMENT_TIMEOUT';
  if (error?.code === '42703' || error?.code === '42883') return 'SCHEMA_MISMATCH';
  if (error?.code === '55000') return 'BASELINE_DRIFT';
  return 'ROLLOUT_GUARD_FAILED';
}

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
    result.approval_constraint
      ?.replace(/\s|[()]/g, '')
      .replaceAll('::text', '')
      .toLowerCase() !== "checkprivacy_review_status<>'approved'orprivacy_approved_atisnotnull"
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
