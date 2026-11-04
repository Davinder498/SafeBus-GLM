#!/usr/bin/env node
import fs from 'node:fs/promises';
import { assertReviewedCheckout } from './lib/security-workflow-evidence.mjs';
import { authPasswordProtectionApi } from './lib/auth-password-protection.mjs';
const mode = process.argv[2];
let patchAttempted = false;
try {
  const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
  assertReviewedCheckout(releaseSha);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
    !/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID ?? '') ||
    !['prepare', 'enable', 'verify'].includes(mode)
  )
    throw new Error('AUTH_SECURITY_PROTECTED_CONTEXT');
  const api = authPasswordProtectionApi({
    projectId: process.env.SUPABASE_PROJECT_ID,
    token: process.env.SUPABASE_ACCESS_TOKEN,
  });
  const directory = '.safebus-release/auth-password-protection';
  await fs.mkdir(directory, { recursive: true });
  const identity = {
    releaseSha,
    runId: process.env.GITHUB_RUN_ID,
    projectId: process.env.SUPABASE_PROJECT_ID,
  };
  const write = (name, fields) =>
    fs.writeFile(
      `${directory}/${name}.json`,
      JSON.stringify({ ...identity, ...fields }, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  if (mode === 'prepare') {
    await write('before', {
      observedAt: new Date().toISOString(),
      passwordHibpEnabled: await api.read(),
      observationOnly: true,
    });
  } else if (mode === 'enable') {
    if (process.env.SAFEBUS_AUTH_SECURITY_CONFIRM !== 'ENABLE_LEAKED_PASSWORD_PROTECTION')
      throw new Error('AUTH_SECURITY_CONFIRMATION');
    const before = JSON.parse(await fs.readFile(`${directory}/before.json`, 'utf8'));
    const age = Date.now() - Date.parse(before.observedAt);
    if (
      Object.entries(identity).some(([key, value]) => before[key] !== value) ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 3_600_000
    )
      throw new Error('AUTH_SECURITY_EVIDENCE');
    const outcome = await api.enable(before.passwordHibpEnabled, () => {
      patchAttempted = true;
    });
    await write('installation', { ...outcome, verifiedAt: new Date().toISOString() });
  } else {
    if (!(await api.read())) throw new Error('AUTH_SECURITY_NOT_ENABLED');
    await write('verification', {
      passwordHibpEnabled: true,
      verifiedAt: new Date().toISOString(),
      observationOnly: true,
    });
  }
  console.log(JSON.stringify({ result: 'verified', mode }));
} catch (error) {
  console.error(
    JSON.stringify({
      result: 'failed',
      code: /^AUTH_SECURITY_[A-Z_0-9]+$/.test(error?.message ?? '')
        ? error.message
        : 'AUTH_SECURITY_ERROR',
      patchOutcomeRequiresInspection: patchAttempted,
    }),
  );
  process.exitCode = 1;
}
