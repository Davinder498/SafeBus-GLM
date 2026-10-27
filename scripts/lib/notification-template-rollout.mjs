import { createHash } from 'node:crypto';
import { recipientPreferenceDigest } from './recipient-push-rollout.mjs';

export const templateDigest = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => {
  const text = value.replaceAll('\r', '').trim().replace(/;$/, '').trimEnd();
  const parts = text.match(/^([\s\S]*?)\bAS \$function\$([\s\S]*)\$function\$$/i);
  if (!parts) throw new Error('TEMPLATE_DEFINITION_INVALID');
  // pg_get_functiondef reformats SQL headers, but the executable body must match exactly.
  return (
    parts[1]
      .replace(/\bpublic\./g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase() +
    '\n$function$' +
    parts[2] +
    '$function$'
  );
};
const signatures = (config) =>
  [...config.baseline.map((entry) => entry.signature), ...config.newFunctions].sort();

export async function verifyTemplateDependencies(client, config) {
  for (const signature of config.authenticationDependencies) {
    const {
      rows: [row],
    } = await client.query('select to_regprocedure($1) is not null as present', [signature]);
    if (!row.present) throw new Error('TEMPLATE_AUTH_DEPENDENCY_MISSING');
  }
}

export function templateDefinitions(sql, config) {
  const entries = [
    ...sql.matchAll(/CREATE OR REPLACE FUNCTION ([a-z_]+\.[a-z_]+)\([\s\S]*?\$function\$;/g),
  ].map((match) => ({
    signature: signatures(config).find((signature) => signature.startsWith(match[1] + '(')),
    definition: normalize(match[0]),
  }));
  if (
    entries.length !== signatures(config).length ||
    entries.some((entry) => !entry.signature) ||
    new Set(entries.map((entry) => entry.signature)).size !== entries.length
  )
    throw new Error('TEMPLATE_DEFINITION_INVALID');
  return entries;
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
  const { rows: triggers } = await client.query(
    `select tgname as name,pg_get_triggerdef(oid) as definition,tgenabled as enabled
     from pg_trigger where tgrelid='public.student_guardians'::regclass
       and tgname=any($1::text[]) order by tgname`,
    [
      [
        config.triggerRename.beforeName,
        config.triggerRename.afterName,
        ...config.triggerPrerequisites.map((entry) => entry.name),
      ],
    ],
  );
  return { functions, triggers };
}

export async function verifyTemplateInstallation(client, sql, config, recovery = null) {
  await verifyTemplateDependencies(client, config);
  const snapshot = await templateSnapshot(client, config);
  for (const expected of templateDefinitions(sql, config)) {
    const actual = snapshot.functions.find((entry) => entry.signature === expected.signature);
    if (!actual?.definition || normalize(actual.definition) !== expected.definition)
      throw new Error('TEMPLATE_INSTALLED_DRIFT');
    const previous = recovery?.functions.find((entry) => entry.signature === expected.signature);
    const expectedAcl =
      previous?.acl ?? config.baseline.find((entry) => entry.signature === expected.signature)?.acl;
    if (expectedAcl && JSON.stringify([...expectedAcl].sort()) !== JSON.stringify(actual.acl))
      throw new Error('TEMPLATE_ACL_CHANGED');
  }
  for (const signature of config.newFunctions) {
    const {
      rows: [row],
    } = await client.query(
      `select has_function_privilege('anon',$1,'execute')
      or has_function_privilege('authenticated',$1,'execute') as exposed`,
      [signature],
    );
    if (row.exposed) throw new Error('TEMPLATE_HELPER_EXPOSED');
  }
  if (
    snapshot.triggers.length !== 3 ||
    !snapshot.triggers.some(
      (entry) =>
        entry.name === config.triggerRename.afterName &&
        entry.definition === config.triggerRename.afterDefinition &&
        entry.enabled === 'O',
    ) ||
    snapshot.triggers.some((entry) => entry.name === config.triggerRename.beforeName)
  )
    throw new Error('TEMPLATE_TRIGGER_DRIFT');
  for (const required of config.triggerPrerequisites) {
    const actual = snapshot.triggers.find((entry) => entry.name === required.name);
    if (
      !actual ||
      actual.enabled !== 'O' ||
      createHash('md5').update(actual.definition).digest('hex') !== required.md5
    )
      throw new Error('TEMPLATE_TRIGGER_DRIFT');
  }
  return {
    definitionsMatched: snapshot.functions.length,
    privateHelpers: config.newFunctions.length,
  };
}

export function templateRestoreSql(snapshot) {
  if (
    !snapshot.triggers?.some(
      (entry) => entry.name === 'student_guardians_notify' && entry.enabled === 'O',
    )
  )
    throw new Error('TEMPLATE_RECOVERY_SCOPE');
  // Changed functions retain their existing ACLs; new helpers are explicitly removed.
  return [
    ...snapshot.functions
      .filter((entry) => entry.definition)
      .map((entry) => entry.definition.trim().replace(/;$/, '') + ';'),
    ...snapshot.functions
      .filter((entry) => !entry.definition)
      .sort((a, b) => {
        const dependencyOrder = (entry) =>
          entry.signature.includes('notification_push_copy') ? 0 : 1;
        return dependencyOrder(a) - dependencyOrder(b);
      })
      .map((entry) => {
        if (
          !/^safebus_private\.notification_(?:event_title|preview_text|push_copy)\([a-z_. ,]+\)$/.test(
            entry.signature,
          )
        )
          throw new Error('TEMPLATE_RECOVERY_SCOPE');
        return `DROP FUNCTION ${entry.signature};`;
      }),
    'ALTER TRIGGER zzzz_student_guardians_notify ON public.student_guardians RENAME TO student_guardians_notify;',
  ].join('\n');
}

export async function templateReadOnly(client, run) {
  await client.query('begin isolation level repeatable read read only');
  try {
    await client.query("set local statement_timeout='5s';set local lock_timeout='1s'");
    return await run();
  } finally {
    await client.query('rollback');
  }
}

export async function rehearseTemplates(client, sql, config) {
  await templateReadOnly(client, () => verifyTemplateDependencies(client, config));
  const before = await templateReadOnly(client, () => templateSnapshot(client, config));
  await client.query('begin isolation level repeatable read');
  let result;
  try {
    await client.query(
      "set local statement_timeout='5s';set local lock_timeout='1s';set local check_function_bodies=on",
    );
    const preferences = await recipientPreferenceDigest(client);
    await client.query(sql);
    result = await verifyTemplateInstallation(client, sql, config, before);
    if (preferences !== (await recipientPreferenceDigest(client)))
      throw new Error('TEMPLATE_PREFERENCES_CHANGED');
  } finally {
    await client.query('rollback');
    const restored = await templateReadOnly(client, () => templateSnapshot(client, config));
    if (JSON.stringify(before) !== JSON.stringify(restored))
      throw new Error('TEMPLATE_RESTORATION_FAILED');
  }
  return result;
}
