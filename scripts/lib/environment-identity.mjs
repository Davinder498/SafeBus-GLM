import { createHash } from 'node:crypto';

export const ENVIRONMENTS = ['development', 'staging', 'production'];

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseUrl(value, name) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

export function databaseTargetId(databaseUrl) {
  const target = parseUrl(databaseUrl, 'Database URL');
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) {
    throw new Error('Database URL must use PostgreSQL.');
  }
  return digest([databaseProjectRef(databaseUrl), target.pathname].join('|'));
}

function publicProjectIdentity(supabaseUrl) {
  const target = parseUrl(supabaseUrl, 'Supabase URL');
  if (target.protocol !== 'https:') throw new Error('Supabase URL must use HTTPS.');
  const match = /^([a-z0-9]{20})\.supabase\.co$/i.exec(target.hostname);
  if (!match) {
    throw new Error('Supabase URL must use the project-specific *.supabase.co origin.');
  }
  return {
    projectRef: match[1].toLowerCase(),
    originHash: digest(target.origin.toLowerCase()),
  };
}

export function supabaseTargetIdentity(supabaseUrl) {
  const identity = publicProjectIdentity(supabaseUrl);
  return {
    projectRefHash: digest(identity.projectRef),
    publicApiOriginHash: identity.originHash,
  };
}

function databaseProjectRef(databaseUrl) {
  const target = parseUrl(databaseUrl, 'Database URL');
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/i.exec(target.hostname);
  if (direct) return direct[1].toLowerCase();

  const poolerUser = /^postgres\.([a-z0-9]{20})$/i.exec(decodeURIComponent(target.username));
  if (poolerUser && /\.pooler\.supabase\.com$/i.test(target.hostname)) {
    return poolerUser[1].toLowerCase();
  }
  throw new Error(
    'Database URL must identify its Supabase project through a direct host or pooler username.',
  );
}

export function createEnvironmentBinding({ environment, databaseUrl, supabaseUrl }) {
  if (!ENVIRONMENTS.includes(environment)) {
    throw new Error('Environment must be development, staging, or production.');
  }
  const publicIdentity = publicProjectIdentity(supabaseUrl);
  if (databaseProjectRef(databaseUrl) !== publicIdentity.projectRef) {
    throw new Error('Database URL and Supabase URL identify different projects.');
  }
  return {
    environment,
    databaseTarget: databaseTargetId(databaseUrl),
    projectRefHash: digest(publicIdentity.projectRef),
    publicApiOriginHash: publicIdentity.originHash,
  };
}

export async function ensureEnvironmentIdentityTable(client) {
  await client.query(`
    create schema if not exists safebus_release;
    revoke all on schema safebus_release from public, anon, authenticated;
    create table if not exists safebus_release.environment_identity (
      singleton boolean primary key default true check (singleton),
      environment text not null check (environment in ('development', 'staging', 'production')),
      database_target text not null check (database_target ~ '^[0-9a-f]{64}$'),
      project_ref_hash text not null check (project_ref_hash ~ '^[0-9a-f]{64}$'),
      public_api_origin_hash text not null check (public_api_origin_hash ~ '^[0-9a-f]{64}$'),
      registered_release_sha text not null check (registered_release_sha ~ '^[0-9a-f]{40}$'),
      registered_at timestamptz not null default clock_timestamp()
    );
    revoke all on table safebus_release.environment_identity from public, anon, authenticated;
  `);
}

export async function registerEnvironmentIdentity(client, binding, releaseSha) {
  await ensureEnvironmentIdentityTable(client);
  await client.query(
    `insert into safebus_release.environment_identity
       (singleton, environment, database_target, project_ref_hash,
        public_api_origin_hash, registered_release_sha)
     values (true, $1, $2, $3, $4, $5)`,
    [
      binding.environment,
      binding.databaseTarget,
      binding.projectRefHash,
      binding.publicApiOriginHash,
      releaseSha,
    ],
  );
}

export async function assertEnvironmentIdentity(client, binding) {
  const registration = await client.query(
    `select to_regclass('safebus_release.environment_identity') as identity_table`,
  );
  if (!registration.rows[0]?.identity_table) {
    throw new Error('Database environment identity is not registered.');
  }
  const identity = await client.query(`
    select environment, database_target, project_ref_hash, public_api_origin_hash
      from safebus_release.environment_identity
     where singleton = true
  `);
  if (identity.rowCount !== 1) {
    throw new Error('Database environment identity is missing or invalid.');
  }
  const actual = identity.rows[0];
  for (const field of [
    ['environment', binding.environment],
    ['database_target', binding.databaseTarget],
    ['project_ref_hash', binding.projectRefHash],
    ['public_api_origin_hash', binding.publicApiOriginHash],
  ]) {
    if (actual[field[0]] !== field[1]) {
      throw new Error('Database environment identity does not match the requested target.');
    }
  }
}

export async function assertDatabaseEnvironmentIdentity(client, { environment, databaseUrl }) {
  if (!ENVIRONMENTS.includes(environment)) {
    throw new Error('Environment must be development, staging, or production.');
  }
  const expectedTarget = databaseTargetId(databaseUrl);
  const registration = await client.query(
    `select to_regclass('safebus_release.environment_identity') as identity_table`,
  );
  if (!registration.rows[0]?.identity_table) {
    throw new Error('Database environment identity is not registered.');
  }
  const identity = await client.query(`
    select environment, database_target
      from safebus_release.environment_identity
     where singleton = true
  `);
  if (identity.rowCount !== 1) {
    throw new Error('Database environment identity is missing or invalid.');
  }
  if (
    identity.rows[0].environment !== environment ||
    identity.rows[0].database_target !== expectedTarget
  ) {
    throw new Error('Database environment identity does not match the requested target.');
  }
}
