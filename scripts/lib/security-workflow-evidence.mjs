import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

export function verifiedDatabaseClient(databaseUrl, ca, applicationName) {
  if (!ca?.includes('-----BEGIN CERTIFICATE-----'))
    throw new Error('The approved database CA certificate is required.');
  const url = new URL(databaseUrl);
  for (const name of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(name);
  return new pg.Client({
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
    application_name: applicationName,
    connectionTimeoutMillis: 10000,
  });
}

export function assertReviewedCheckout(releaseSha) {
  if (process.env.GITHUB_ACTIONS !== 'true' || !/^[0-9a-f]{40}$/.test(releaseSha ?? ''))
    throw new Error('Exact reviewed SHA in protected GitHub Actions is required.');
  if (
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== releaseSha ||
    execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      encoding: 'utf8',
    }).trim()
  )
    throw new Error('Reviewed checkout is not exact and clean.');
  execFileSync('git', ['merge-base', '--is-ancestor', releaseSha, 'origin/main'], {
    stdio: 'pipe',
  });
}

export function verifyWorkflowRun(run, { repository, workflow, runId }) {
  if (
    !/^[1-9][0-9]*$/.test(runId ?? '') ||
    String(run?.id) !== runId ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.path !== '.github/workflows/' + workflow ||
    run.event !== 'workflow_dispatch' ||
    run.head_branch !== 'main' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    !/^[0-9a-f]{40}$/.test(run.head_sha ?? '')
  )
    throw new Error(
      'Evidence must come from a successful protected main-branch workflow in this repository.',
    );
}

export async function downloadWorkflowEvidence({ repository, workflow, runId, prefix, directory }) {
  if (!/^Davinder498\/SafeBus-GLM$/.test(repository ?? '') || !/^[1-9][0-9]*$/.test(runId ?? ''))
    throw new Error('Invalid evidence source.');
  const run = JSON.parse(
    execFileSync('gh', ['api', `repos/${repository}/actions/runs/${runId}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  verifyWorkflowRun(run, { repository, workflow, runId });
  execFileSync('git', ['merge-base', '--is-ancestor', run.head_sha, 'HEAD'], { stdio: 'pipe' });
  await fs.mkdir(directory, { recursive: true });
  execFileSync(
    'gh',
    [
      'run',
      'download',
      runId,
      '--repo',
      repository,
      '--name',
      prefix + run.head_sha,
      '--dir',
      directory,
    ],
    { stdio: 'pipe' },
  );
  const file = prefix === 'existing-security-backup-' ? 'backup.json' : 'evidence.json';
  const evidence = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
  if (evidence.releaseSha !== run.head_sha || (evidence.runId && evidence.runId !== runId))
    throw new Error('Artifact commit or workflow run binding is invalid.');
  return evidence;
}

export function safeSecurityFailure(error, stage) {
  const knownReasons = new Map([
    ['Backup RSA public key is required.', 'BACKUP_PUBLIC_KEY_MISSING'],
    ['The approved database CA certificate is required.', 'DATABASE_CA_MISSING'],
    [
      'Backup encryption requires an RSA public key of at least 3072 bits.',
      'BACKUP_PUBLIC_KEY_INVALID',
    ],
    ['Recovery receipt differs from the reviewed digest.', 'RECOVERY_RECEIPT_DIGEST'],
    [
      'Backup does not match the reviewed project, catalog, and SQL inputs.',
      'RECOVERY_BINDING_MISMATCH',
    ],
    [
      'A human-verified, off-site backup and full restore receipt is required.',
      'RECOVERY_NOT_VERIFIED',
    ],
    ['Recovery evidence must be no more than 24 hours old.', 'RECOVERY_EXPIRED'],
    [
      'Backup requires the direct or session-mode connection on port 5432.',
      'BACKUP_CONNECTION_MODE',
    ],
    ['PostgreSQL 17 backup tools are required for this reviewed project.', 'BACKUP_CLIENT_VERSION'],
    ['PostgreSQL export failed.', 'BACKUP_EXPORT_FAILED'],
    ['Backup client could not start.', 'BACKUP_CLIENT_UNAVAILABLE'],
    ['Another schema operation is running.', 'SCHEMA_LOCK_BUSY'],
    [
      'Release metadata already exists; inspect it before retrying or adopting.',
      'RELEASE_ALREADY_REGISTERED',
    ],
    [
      'Database schema changed after backup; capture and verify a fresh backup.',
      'BACKUP_SCHEMA_DRIFT',
    ],
    ['Database schema changed during export; capture a fresh backup.', 'BACKUP_SCHEMA_DRIFT'],
    ['Successful matching rollback rehearsal is required.', 'REHEARSAL_MISMATCH'],
  ]);
  const code =
    knownReasons.get(error?.message) ||
    knownReasons.get(error?.safeReason) ||
    (/^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : 'ERROR');
  return (
    `Security workflow failed (stage=${stage}; code=${code}).` +
    (error?.commitOutcomeUnknown
      ? ' Commit outcome is unknown; inspect the installation ledger before retrying.'
      : '')
  );
}
