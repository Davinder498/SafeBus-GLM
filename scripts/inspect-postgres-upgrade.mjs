#!/usr/bin/env node
import fs from 'node:fs/promises';
import { assertReviewedCheckout } from './lib/security-workflow-evidence.mjs';
import { inspectPostgresUpgrade } from './lib/postgres-upgrade-preflight.mjs';
try {
  const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
  assertReviewedCheckout(releaseSha);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
    process.env.SAFEBUS_UPGRADE_CONFIRM !== 'INSPECT_POSTGRES_UPGRADE' ||
    !/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID ?? '')
  )
    throw new Error('UPGRADE_PREFLIGHT_PROTECTED_CONTEXT');
  if (!process.env.SUPABASE_UPGRADE_READ_TOKEN?.trim())
    throw new Error('UPGRADE_PREFLIGHT_READ_TOKEN_MISSING');
  const evidence = await inspectPostgresUpgrade({
    projectId: process.env.SUPABASE_PROJECT_ID,
    token: process.env.SUPABASE_UPGRADE_READ_TOKEN,
  });
  const directory = '.safebus-release/postgres-upgrade';
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    `${directory}/preflight.json`,
    JSON.stringify(
      {
        releaseSha,
        runId: process.env.GITHUB_RUN_ID,
        projectId: process.env.SUPABASE_PROJECT_ID,
        observedAt: new Date().toISOString(),
        ...evidence,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    JSON.stringify({ result: 'observed', providerChecksClear: evidence.providerChecksClear }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      result: 'failed',
      ...(error?.message === 'UPGRADE_PREFLIGHT_HTTP_401' ||
      error?.message === 'UPGRADE_PREFLIGHT_READ_TOKEN_MISSING'
        ? {
            remediation:
              'Set the production environment secret SUPABASE_UPGRADE_READ_TOKEN to a valid BusSafe-scoped personal access token. Keep the token out of logs and chat.',
          }
        : error?.message === 'UPGRADE_PREFLIGHT_HTTP_403'
          ? {
              remediation:
                'Check BusSafe project scope and Project Settings Read plus Database Read permissions for SUPABASE_UPGRADE_READ_TOKEN.',
            }
          : {}),
      code: /^UPGRADE_PREFLIGHT_[A-Z_0-9]+$/.test(error?.message ?? '')
        ? error.message
        : 'UPGRADE_PREFLIGHT_ERROR',
    }),
  );
  process.exitCode = 1;
}
