import fs from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
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
import { cleanupRecoveryProfiles } from './lib/recovery-api-cleanup.mjs';
import { recoveryPolicyQuery } from './lib/recovery-runtime-catalog.mjs';
import {
  channelFailureCode,
  withRealtimeStartupRetry,
  safeFailureCode,
} from './lib/recovery-api-diagnostics.mjs';
const roles = [
  'tenant_admin',
  'transportation_admin',
  'driver',
  'guardian',
  'platform_super_admin',
  'tenant_admin',
  'guardian',
];
const tenantIds = [randomUUID(), randomUUID()];
const run = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
const emails = roles.map((_, i) => `capacity-api-${run}-${i}@example.test`);
const tenantNames = [0, 1].map((i) => `Capacity API ${run} ${i}`);
const accounts = [];
let cleanupArmed = false;
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
    process.env.SAFEBUS_CAPACITY_CONFIRM !== 'CHECK_RECOVERY_API' ||
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
    'safebus-recovery-api-check',
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
    (select count(*) from public.profiles)::int profiles,
    (select count(*) from auth.sessions)::int sessions,
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
  const expectedPolicies = JSON.parse(
    await fs.readFile('tests/capacity/recovery-runtime-policies.json', 'utf8'),
  );
  await db.query('set search_path=pg_catalog');
  if (
    JSON.stringify((await db.query(recoveryPolicyQuery)).rows) !== JSON.stringify(expectedPolicies)
  )
    throw Error('POLICIES_CHANGED');
  const hooks = (
    await db.query(
      "select setting from pg_db_role_setting s join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) setting where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%'",
    )
  ).rows;
  if (
    hooks.length !== 1 ||
    hooks[0].setting !== 'pgrst.db_pre_request=safebus_private.enforce_active_api_session'
  )
    throw Error('HOOK_CHANGED');
  // Arm before the first fixture write, including an uncertain commit response.
  cleanupArmed = true;
  stage = 'fixture-tenants';
  for (let i = 0; i < 2; i++)
    await db.query("insert into public.tenants(id,name,type) values($1,$2,'demo')", [
      tenantIds[i],
      tenantNames[i],
    ]);
  for (let i = 0; i < roles.length; i++) {
    stage = `fixture-account-${i}`;
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
    const tenant = i === 4 ? null : tenantIds[i < 5 ? 0 : 1];
    await db.query(
      "insert into public.profiles(id,tenant_id,full_name,first_name,last_name,email,role,status) values($1,$2,'Capacity Synthetic','Capacity','Synthetic',$3,$4,'active')",
      [user.id, tenant, emails[i], roles[i]],
    );
    const client = createClient(RECOVERY_AUTH_URL, pub, options);
    clients.push(client);
    const login = checked(await client.auth.signInWithPassword({ email: emails[i], password }));
    if (login.user?.id !== user.id || checked(await client.auth.getUser()).user?.id !== user.id)
      throw Error('LOGIN_IDENTITY_MISMATCH');
    const aal1 = login.session.access_token;
    if (!['driver', 'guardian'].includes(roles[i])) {
      stage = `mfa-${i}`;
      const factor = checked(
        await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Disposable API check' }),
      );
      checked(
        await client.auth.mfa.challengeAndVerify({
          factorId: factor.id,
          code: recoveryTotp(factor.totp.secret),
        }),
      );
      if (checked(await client.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel !== 'aal2')
        throw Error('MFA_FAILED');
    }
    const session = checked(await client.auth.getSession()).session;
    accounts.push({
      client,
      id: user.id,
      tenant,
      role: roles[i],
      aal1,
      token: session.access_token,
    });
  }
  stage = 'retired-role-denial';
  await db.query('begin');
  try {
    await db.query(
      "insert into public.profiles(id,tenant_id,full_name,first_name,last_name,email,role) values($1,$2,'Retired Role','Retired','Role','retired@example.test','school_admin')",
      [accounts[0].id, tenantIds[0]],
    );
    throw Error('RETIRED_ROLE_ACCEPTED');
  } catch (error) {
    if (error.code !== '42501') throw error;
  } finally {
    await db.query('rollback');
  }
  stage = 'cleanup-rehearsal';
  await cleanupRecoveryProfiles(db, { run, emails, tenantIds, tenantNames, rehearse: true });
  stage = 'temporary-api-access';
  await db.query('grant usage on schema public,safebus_private to authenticated');
  const api = async (token, path) => {
    const response = await safeFetch(`${RECOVERY_AUTH_URL}/rest/v1/${path}`, {
      headers: { apikey: pub, Authorization: `Bearer ${token}` },
    });
    return { status: response.status, body: await response.json() };
  };
  const expectDenied = (result) => {
    if (result.status !== 403 || result.body.code !== '42501') throw Error('EXPECTED_API_DENIAL');
  };
  for (const [i, a] of accounts.entries()) {
    stage = `api-role-${i}`;
    const tenants = await api(a.token, 'tenants?select=id');
    const expected = a.role === 'platform_super_admin' ? tenantIds : [a.tenant];
    if (
      tenants.status !== 200 ||
      JSON.stringify(tenants.body.map((r) => r.id).sort()) !== JSON.stringify([...expected].sort())
    )
      throw Error('TENANT_SCOPE_MISMATCH');
    const profiles = await api(a.token, 'profiles?select=id,tenant_id');
    if (
      profiles.status !== 200 ||
      !profiles.body.some((p) => p.id === a.id) ||
      (a.role !== 'platform_super_admin' && profiles.body.some((p) => p.tenant_id !== a.tenant))
    )
      throw Error('PROFILE_SCOPE_MISMATCH');
    if (a.role !== 'platform_super_admin') {
      const foreign = await api(
        a.token,
        `tenants?select=id&id=eq.${tenantIds.find((id) => id !== a.tenant)}`,
      );
      if (foreign.status !== 200 || foreign.body.length) throw Error('CROSS_TENANT_LEAK');
    }
    if (!['driver', 'guardian'].includes(a.role))
      expectDenied(await api(a.aal1, 'tenants?select=id'));
    stage = `realtime-role-${i}`;
    await a.client.realtime.setAuth(a.token);
    stage = `realtime-role-${i}-own-notification`;
    await probeChannel(a.client, `safebus:notifications:${a.id}`, true);
    stage = `realtime-role-${i}-foreign-notification`;
    await probeChannel(
      a.client,
      `safebus:notifications:${accounts[(i + 1) % accounts.length].id}`,
      false,
    );
    if (a.tenant) {
      stage = `realtime-role-${i}-own-tenant`;
      await probeChannel(
        a.client,
        `safebus:tenant:${a.tenant}`,
        ['tenant_admin', 'transportation_admin'].includes(a.role),
      );
      stage = `realtime-role-${i}-foreign-tenant`;
      await probeChannel(
        a.client,
        `safebus:tenant:${tenantIds.find((id) => id !== a.tenant)}`,
        false,
      );
    }
    stage = `expired-session-${i}`;
    const sessionId = JSON.parse(
      Buffer.from(a.token.split('.')[1], 'base64url').toString(),
    ).session_id;
    await db.query(
      "update auth.sessions set not_after=now()-interval '1 minute' where id=$1 and user_id=$2",
      [sessionId, a.id],
    );
    expectDenied(await api(a.token, 'tenants?select=id'));
    await probeChannel(a.client, `safebus:notifications:${a.id}`, false);
    await db.query('update auth.sessions set not_after=null where id=$1 and user_id=$2', [
      sessionId,
      a.id,
    ]);
    stage = `logout-denial-${i}`;
    checked(await a.client.auth.signOut({ scope: 'global' }));
    expectDenied(await api(a.token, 'tenants?select=id'));
    // Reconnect with the still-unexpired signed JWT, after server session revocation.
    await a.client.realtime.setAuth(a.token);
    await probeChannel(a.client, `safebus:notifications:${a.id}`, false);
  }
  passed = true;
} catch (error) {
  console.error(
    `Recovery API check failed at stage=${stage}; code=${safeFailureCode(error)}; credentials and provider responses omitted.`,
  );
  process.exitCode = 1;
} finally {
  if (connected) {
    try {
      await db.query('rollback');
      if (cleanupArmed) {
        // Commit quarantine before the deletion exception is entered.
        await db.query('revoke usage on schema public,safebus_private from authenticated');
        for (const client of clients) await client.removeAllChannels();
        await quarantine();
        await cleanupRecoveryProfiles(db, { run, emails, tenantIds, tenantNames });
      }
      if (armed) {
        // Includes an account created server-side even if its HTTP response timed out.
        const owned = (
          await db.query(
            "select id from auth.users where raw_app_meta_data->>'safebus_capacity_run'=$1 and email=any($2::text[])",
            [run, emails],
          )
        ).rows;
        if (owned.length > 7) throw Error('CLEANUP_SCOPE_MISMATCH');
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
        'Recovery API cleanup or quarantine verification failed; inspect this run before retrying.',
      );
    }
    await db.end().catch(() => {});
  }
  for (const client of clients) client.auth.stopAutoRefresh();
}
if (passed && !process.exitCode) {
  await fs.mkdir('.safebus-release/recovery-api', { recursive: true });
  await fs.writeFile(
    '.safebus-release/recovery-api/evidence.json',
    JSON.stringify(
      {
        releaseSha: process.env.SAFEBUS_RELEASE_SHA,
        accountsCreatedAndRemoved: 7,
        passwordLogin: true,
        totpMfa: true,

        revokedApiAndNewChannelDenied: true,
        quarantined: true,
        applicationRolesVerified: true,
        httpHookVerified: true,
        privateNotificationAndTenantChannelsVerified: true,
        sharedBusTrackingVerified: false,
        existingChannelRevocationVerified: false,
        capacityVerified: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'Recovery API roles, MFA, private channels and cleanup verified; application API re-quarantined.',
  );
}

// A timeout never counts as an authorization denial. Each successful subscription
// must receive a unique server-originated payload on this exact private topic.
async function probeChannel(client, topic, allowed) {
  return withRealtimeStartupRetry(() => probeChannelOnce(client, topic, allowed));
}
async function probeChannelOnce(client, topic, allowed) {
  const nonce = randomUUID();
  let timer, receive;
  const delivery = new Promise((resolve) => {
    receive = resolve;
  });
  const channel = client
    .channel(topic, { config: { private: true } })
    .on('broadcast', { event: 'capacity_probe' }, ({ payload }) => {
      if (payload?.nonce === nonce) receive();
    });
  try {
    const result = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Error('CHANNEL_TIMEOUT')), 12000);
      channel.subscribe((status, error) => {
        if (status === 'SUBSCRIBED') resolve(true);
        if (status === 'CHANNEL_ERROR') {
          const code = channelFailureCode(error);
          if (code === 'CHANNEL_AUTHORIZATION_DENIED') resolve(false);
          else reject(Error(code));
        }
        if (status === 'TIMED_OUT') reject(Error('CHANNEL_TIMEOUT'));
      });
    });
    clearTimeout(timer);
    if (result !== allowed) throw Error('CHANNEL_SCOPE_MISMATCH');
    if (allowed) {
      await db.query('select realtime.send($1::jsonb,$2,$3,true)', [
        JSON.stringify({ nonce }),
        'capacity_probe',
        topic,
      ]);
      await Promise.race([
        delivery,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('DELIVERY_TIMEOUT')), 8000);
        }),
      ]);
    }
  } finally {
    clearTimeout(timer);
    await client.removeChannel(channel);
  }
}
