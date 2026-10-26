#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createEnvironmentBinding } from './lib/environment-identity.mjs';
import {
  verifiedDatabaseClient,
  assertReviewedCheckout,
} from './lib/security-workflow-evidence.mjs';

let client;
let stage = 'preflight';
try {
  assertReviewedCheckout(process.env.SAFEBUS_RELEASE_SHA);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production'
  )
    throw new Error('Protected production context required.');
  const { projectId } = JSON.parse(
    await readFile('config/pending/complete-recipient-push.json', 'utf8'),
  );
  const binding = createEnvironmentBinding({
    environment: 'production',
    databaseUrl: process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
  });
  if (
    projectId !== 'ckrkfylsyihwouvesypm' ||
    binding.projectRefHash !== createHash('sha256').update(projectId).digest('hex')
  )
    throw new Error('Unapproved target.');
  client = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'safebus-push-provider-validation',
  );
  await client.connect();
  stage = 'dispatcher-configuration';
  await client.query('begin transaction read only');
  let secret;
  try {
    await client.query("set local statement_timeout='5s'; set local lock_timeout='1s'");
    secret = (
      await client.query(
        "select decrypted_secret from vault.decrypted_secrets where name='safebus_push_dispatcher_secret'",
      )
    ).rows;
  } finally {
    await client.query('rollback');
  }
  if (secret.length !== 1 || secret[0].decrypted_secret.length < 32)
    throw new Error('Dispatcher secret missing.');
  stage = 'firebase-validate-only';
  const response = await fetch(
    new URL('/functions/v1/push-notification-dispatcher', process.env.SUPABASE_URL),
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'content-type': 'application/json',
        'x-safebus-push-secret': secret[0].decrypted_secret,
      },
      body: JSON.stringify({ mode: 'validate' }),
    },
  );
  if (!response.ok) throw new Error('Provider validation failed.');
  const result = await response.json();
  if (result.firebase !== 'validated' || result.notificationSent !== false)
    throw new Error('Invalid provider validation result.');
  console.log(
    'PASS: Firebase authentication, messaging authorization, and registered-device payload validated; no notification sent.',
  );
} catch {
  console.error(
    `Push provider verification failed at ${stage}. No test notification was sent. Inspect protected function diagnostics before requesting Firebase access.`,
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
