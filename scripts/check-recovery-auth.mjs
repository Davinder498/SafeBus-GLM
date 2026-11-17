import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  verifiedDatabaseClient,
  assertReviewedCheckout,
} from './lib/security-workflow-evidence.mjs';
import {
  createEnvironmentBinding,
  assertEnvironmentIdentity,
} from './lib/environment-identity.mjs';
import { RECOVERY_AUTH_URL, assertRecoveryAuthKeys, recoveryTotp } from './lib/recovery-auth.mjs';
const { createClient } = createRequire(new URL('../apps/web/package.json', import.meta.url))(
  '@supabase/supabase-js',
);
const run = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
const emails = [0, 1].map((i) => `capacity-auth-${run}-${i}@example.test`);
const clients = [];
let db,
  admin,
  connected = false,
  armed = false,
  stage = 'preflight',
  passed = false;
const checked = (result) => {
  if (result.error) throw Error('AUTH_OPERATION_FAILED');
  return result.data;
};
async function quarantine() {
  const result = await db.query(
    "select count(*)::int as n from unnest(array['anon','authenticated','service_role']) r where has_schema_privilege(r,'public','USAGE') or has_schema_privilege(r,'safebus_private','USAGE')",
  );
  if (result.rows[0].n !== 0) throw Error('QUARANTINE_CHANGED');
}
try {
  assertReviewedCheckout(process.env.SAFEBUS_RELEASE_SHA);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_CAPACITY_CONFIRM !== 'CHECK_RECOVERY_AUTH' ||
    !/^\d+-\d+$/.test(run)
  )
    throw Error('PROTECTED_WORKFLOW_REQUIRED');
  const secret = process.env.SAFEBUS_CAPACITY_AUTH_SECRET;
  const pub = process.env.SAFEBUS_CAPACITY_PUBLISHABLE_KEY;
  assertRecoveryAuthKeys(secret, pub);
  const url = new URL(process.env.SAFEBUS_CAPACITY_DATABASE_URL);
  if (
    url.pathname !== '/postgres' ||
    (url.port || '5432') !== '5432' ||
    url.search ||
    url.hash ||
    !url.password
  )
    throw Error('SESSION_CONNECTION_REQUIRED');
  const binding = createEnvironmentBinding({
    environment: 'staging',
    databaseUrl: url.toString(),
    supabaseUrl: RECOVERY_AUTH_URL,
  });
  db = verifiedDatabaseClient(
    url.toString(),
    process.env.SAFEBUS_CAPACITY_DATABASE_CA_CERT,
    'safebus-recovery-auth-check',
  );
  await db.connect();
  connected = true;
  await db.query("set statement_timeout='8s'; set lock_timeout='1s'");
  await assertEnvironmentIdentity(db, binding);
  if (
    !(
      await db.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as locked",
      )
    ).rows[0].locked
  )
    throw Error('DEPLOYMENT_BUSY');
  await quarantine();
  const baseline = (
    await db.query(`select
    (select count(*) from auth.users)::int users,
    (select count(*) from public.tenants)::int tenants,
    (select count(*) from cron.job)::int jobs,
    (select count(*) from vault.secrets)::int secrets,
    (select count(*) from storage.objects)::int objects,
    (select count(*) from pg_trigger where tgrelid in ('auth.users'::regclass,'auth.sessions'::regclass) and not tgisinternal)::int triggers`)
  ).rows[0];
  if (Object.values(baseline).some((n) => n !== 0)) throw Error('EMPTY_ISOLATED_BASELINE_REQUIRED');
  // Fix the destination and refuse redirects even if a remote response changes.
  const safeFetch = (input, init) => {
    if (new URL(typeof input === 'string' ? input : input.url).origin !== RECOVERY_AUTH_URL)
      throw Error('AUTH_ORIGIN_REJECTED');
    return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
  };
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: safeFetch },
  };
  const settingsResponse = await safeFetch(`${RECOVERY_AUTH_URL}/auth/v1/settings`, {
    headers: { apikey: pub },
  });
  if (!settingsResponse.ok) throw Error('AUTH_SETTINGS_UNAVAILABLE');
  const settings = await settingsResponse.json();
  if (
    settings.disable_signup !== true ||
    settings.external?.email !== true ||
    settings.external?.phone === true
  )
    throw Error('AUTH_SETTINGS_NOT_ISOLATED');
  admin = createClient(RECOVERY_AUTH_URL, secret, options);
  checked(await admin.auth.admin.listUsers({ page: 1, perPage: 1 }));
  armed = true;
  for (let i = 0; i < emails.length; i++) {
    stage = `account-${i}-create`;
    const password = `Ca9!${randomBytes(32).toString('base64url')}`;
    const { user } = checked(
      await admin.auth.admin.createUser({
        email: emails[i],
        password,
        email_confirm: true,
        app_metadata: { safebus_capacity_run: run },
      }),
    );
    if (!user?.id) throw Error('USER_CREATION_FAILED');
    const client = createClient(RECOVERY_AUTH_URL, pub, options);
    clients.push(client);
    stage = `account-${i}-password-login`;
    const login = checked(await client.auth.signInWithPassword({ email: emails[i], password }));
    if (login.user?.id !== user.id || !login.session) throw Error('LOGIN_IDENTITY_MISMATCH');
    if (checked(await client.auth.getUser()).user?.id !== user.id)
      throw Error('SERVER_IDENTITY_MISMATCH');
    const claims = JSON.parse(
      Buffer.from(login.session.access_token.split('.')[1], 'base64url').toString(),
    );
    if (
      claims.aal !== 'aal1' ||
      claims.sub !== user.id ||
      !(
        await db.query('select 1 from auth.sessions where id=$1 and user_id=$2', [
          claims.session_id,
          user.id,
        ])
      ).rowCount
    )
      throw Error('AUTH_SESSION_MISSING');
    if (i === 1) {
      stage = 'totp-enrollment';
      const factor = checked(
        await client.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Disposable capacity check',
        }),
      );
      stage = 'totp-verification';
      checked(
        await client.auth.mfa.challengeAndVerify({
          factorId: factor.id,
          code: recoveryTotp(factor.totp.secret),
        }),
      );
      if (checked(await client.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel !== 'aal2')
        throw Error('MFA_NOT_VERIFIED');
      if (checked(await client.auth.getUser()).user?.id !== user.id)
        throw Error('MFA_IDENTITY_MISMATCH');
    }
    stage = `account-${i}-refresh`;
    const refreshed = checked(await client.auth.refreshSession());
    if (refreshed.user?.id !== user.id || !refreshed.session) throw Error('REFRESH_FAILED');
    const refreshToken = refreshed.session.refresh_token;
    stage = `account-${i}-logout`;
    checked(await client.auth.signOut({ scope: 'global' }));
    if (!(await client.auth.refreshSession({ refresh_token: refreshToken })).error)
      throw Error('REVOKED_REFRESH_ACCEPTED');
  }
  passed = true;
} catch {
  console.error(
    `Recovery Auth check failed at stage=${stage}; credentials and provider responses omitted.`,
  );
  process.exitCode = 1;
} finally {
  if (connected) {
    try {
      if (armed) {
        // Includes an account created server-side even if its HTTP response timed out.
        const owned = (
          await db.query(
            "select id from auth.users where raw_app_meta_data->>'safebus_capacity_run'=$1 and email=any($2::text[])",
            [run, emails],
          )
        ).rows;
        if (owned.length > 2) throw Error('CLEANUP_SCOPE_MISMATCH');
        for (const row of owned) checked(await admin.auth.admin.deleteUser(row.id));
        if (
          (await db.query('select 1 from auth.users limit 1')).rowCount ||
          (await db.query('select 1 from auth.sessions limit 1')).rowCount
        )
          throw Error('CLEANUP_INCOMPLETE');
      }
      await quarantine();
    } catch {
      passed = false;
      process.exitCode = 1;
      console.error(
        'Recovery Auth cleanup or quarantine verification failed; inspect this run before retrying.',
      );
    }
    await db.end().catch(() => {});
  }
  for (const client of clients) client.auth.stopAutoRefresh();
}
if (passed && !process.exitCode) {
  await fs.mkdir('.safebus-release/recovery-auth', { recursive: true });
  await fs.writeFile(
    '.safebus-release/recovery-auth/evidence.json',
    JSON.stringify(
      {
        releaseSha: process.env.SAFEBUS_RELEASE_SHA,
        accountsCreatedAndRemoved: 2,
        passwordLogin: true,
        totpMfa: true,
        refresh: true,
        revokedRefreshDenied: true,
        quarantined: true,
        applicationRolesVerified: false,
        httpHookVerified: false,
        realtimeVerified: false,
        capacityVerified: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'Recovery Auth login, TOTP, refresh and cleanup verified; application API remains quarantined.',
  );
}
