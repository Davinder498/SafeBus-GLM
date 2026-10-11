# Existing-project security installation

This procedure installs only the reviewed security changes on the existing
prelaunch BusSafe project. It does not deploy the frontend, reset data, create a
Supabase project, replay historical migrations, or approve commercial launch.
Human PR merge review and the protected GitHub `production` environment remain.

## What has passed

The [hosted rehearsal at merge commit 1283e858](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38101560000)
passed code validation and 0123 → 0122 → 0124 plus SQL catalog/negative acceptance.
The inspected catalog was restored after rollback. Its evidence checksums match
the committed SQL. This was not a persistent installation or signed-session test.
The customer confirmed that no recoverable backup has yet been verified.

## Owner setup before the first backup

After this PR is reviewed and merged, use the current full `main` SHA for the
new workflows. They refuse an older checkout, unmerged code, and tracked changes.
Build/test validation runs without database credentials on a separate runner.
The protected job starts with a fresh checkout and shares the existing production
release concurrency group and database advisory lock.

Generate an RSA recovery keypair on the owner's trusted machine, outside this
repository, in a new owner-only directory:

```powershell
node scripts/security-recovery-tools.mjs keypair "$env:LOCALAPPDATA\SafeBusRecovery-20261011"
```

The utility creates `recovery-private.pem` and `recovery-public.pem`, sets an
owner-only Windows directory ACL (or mode 0700 on Unix), and never prints a key.
Retain the private key in the owner's secure offline storage. Do not put the
private key in GitHub, frontend environment variables, this repository, or chat.
Loss of that key makes the encrypted export unusable. Keep the backup and key
in separate protected locations under the customer's recovery ownership.

Set these **public configuration variables** on the protected GitHub
`production` environment:

- `SAFEBUS_BACKUP_PUBLIC_KEY`: the contents of `recovery-public.pem`.
- `SAFEBUS_DATABASE_CA_CERT`: the PEM database root certificate downloaded from
  BusSafe's Supabase connection settings. The runner verifies the TLS chain and
  hostname; it does not downgrade certificate verification.

The existing `SAFEBUS_DATABASE_URL` secret must use the approved BusSafe direct
or session-mode connection on port 5432, not transaction mode on port 6543.
Existing Supabase URL/public-key configuration is reused. No service-role API
key is required by these workflows. Native PostgreSQL 17 client tools are used;
no Docker, `supabase start`, or database reset is run.

## Capture and retain the encrypted database export

Dispatch `backup-existing-security.yml` from `main` with the exact current SHA
and confirmation `BACKUP_EXISTING_SECURITY_ENCRYPTED`. Complete the protected
environment approval. This is a read-only export, not an installation.

The script holds a bounded, repeatable-read snapshot; exports the full logical
database using `pg_dump --snapshot` and custom format; and separately exports
cluster roles without role passwords. All source connections enforce read-only
transactions and verified TLS. Output streams directly into AES-256-GCM; each
random encryption key is wrapped with the owner's RSA public key using
OAEP-SHA256. Plaintext database archives and private decryption keys are never
written to the runner or uploaded. Credentials are passed through the client
environment, not arguments, and provider stderr is withheld from logs.

Download the successful `existing-security-backup-<SHA>` artifact and retain it
in the owner's secure Canadian off-site recovery storage immediately. GitHub's
seven-day encrypted artifact retention is a transfer mechanism, not the durable
backup. The unencrypted catalog/metadata files contain schema definitions and
hashes, not application/Auth rows; keep the complete artifact restricted.

On the trusted owner's machine, with PostgreSQL 17 `pg_restore` installed,
decrypt into a **new** protected directory outside the repository:

```powershell
node scripts/security-recovery-tools.mjs decrypt <artifact-directory> <private-key-file> <new-decrypted-directory>
```

The utility checks ciphertext hashes, GCM authenticity, plaintext hashes and
complete archive decoding. It refuses existing output files and removes partial
plaintext on a failed decryption. Archive decoding is not a database restore.

## Verify recovery before installation

An operator must restore **this exact decrypted archive** to a compatible,
approved, non-production recovery target in Canada and retain the actual restore
record. A paid Supabase branch is not mandatory; a compatible owner-controlled
recovery instance can be used. This procedure does not provision a target or
authorize a destructive restore against the sole BusSafe database. If no recovery
target is approved, stop here and arrange one before marking a restore verified.

The target must match PostgreSQL 17 and required Supabase extensions/managed
schemas. Raw `pg_dump` includes managed objects; do not blindly import reserved
role DDL into an existing managed project. Review role mapping, ownership,
extensions and provider settings for the selected target. Block outbound
delivery/network jobs on that recovery target before importing data. Do not
alter existing BusSafe accounts, trigger controls, scheduler or provider state as
part of the exercise.

Verify schema, constraints, policies, function ownership/grants, default
privileges, sequences, application row counts/data integrity and Auth records
against the source snapshot. Retain actual exit-status/error evidence and
verification results for the operator/reviewer. Do not treat a successful archive
listing, checksum, unit test or rollback rehearsal as full restoration.

The logical export excludes role passwords. Storage object **bytes**, provider
secrets/settings, Vault root-key dependencies and external services need their
own recovery; the SQL catalog includes the PostgREST hook settings for review.
A logical restore receipt for this security installation is not a complete
platform disaster-recovery or commercial operations sign-off.

Create a human restore proof JSON using the fields below. Copy hashes/run ID from
the successful `backup.json`, use real non-secret evidence references, and set
verification booleans to true only after that verification actually passes:

```json
{
  "format": 1,
  "projectRefHash": "<backup.projectRefHash>",
  "catalogSha256": "<backup.catalogSha256>",
  "archiveSha256": "<backup.archive.plaintextSha256>",
  "rolesSha256": "<backup.roles.plaintextSha256>",
  "backupRunId": "<backup.runId>",
  "backupStoredOffSite": false,
  "decryptionVerified": false,
  "fullRestoreVerified": false,
  "schemaAndDataVerified": false,
  "permissionsAndAuthVerified": false,
  "destinationIsProduction": false,
  "destinationCanadian": false,
  "backupLocationReference": "<non-secret recovery storage reference>",
  "restoreEvidenceReference": "<actual successful restore evidence reference>",
  "verifierReference": "<responsible human verifier reference>",
  "verifiedAt": "<UTC verification timestamp>"
}
```

Validate the proof against the actual decrypted files and produce its digest:

```powershell
node scripts/security-recovery-tools.mjs receipt <artifact-directory> <decrypted-directory> <human-restore-proof.json> <new-receipt.json>
```

This utility checks file integrity and required human attestations; it does not
independently observe the operator's external restoration. The environment
reviewer must inspect the referenced recovery evidence. Put the generated JSON
in the protected environment secret `SAFEBUS_SECURITY_RECOVERY_RECEIPT`; the
reviewed SHA256 is the only receipt value needed as a workflow input.
No placeholder or unverified receipt is checked in or generated by CI.

## Protected installation

Dispatch `install-existing-security.yml` from `main` with:

- `git_ref`: the full current reviewed `main` SHA.
- `confirmation`: `INSTALL_EXISTING_SECURITY_0123_0122_0124`.
- `backup_run_id`: the successful protected backup run.
- `rehearsal_run_id`: a successful matching protected rollback rehearsal run.
- `recovery_receipt_sha256`: the human-reviewed receipt digest.

The backup and restore verification must be less than 24 hours old. Renew the
backup and verification if that window expires. The rehearsal must also be less
than 24 hours old. Protected approval must fit inside this evidence window.

Before any DDL the script verifies successful same-repository, main-branch
workflow provenance; downloaded encrypted-file hashes; the receipt's binding to
the actual backup; SQL checksums; and current schema equality with the backed-up
catalog, including default privileges. It then rehearses the actual migration
sequence again and rolls it back. A changed schema or existing release metadata
fails closed. These workflows are limited to the current unadopted snapshot;
they are not a generic migration deployment bypass.

One transaction applies **0123 → 0122 → 0124**, runs the SQL acceptance and records
only those three actual executions in private, RLS-enabled
`safebus_release.security_installations`. Failures before COMMIT roll back.
The ordinary release/adoption baseline is not fabricated or silently extended:
0001–0121 remain unadopted by this procedure and the normal release runner stays
blocked until a separately reviewed honest historical adoption is prepared.

The installation evidence contains commit/checksum/recovery bindings but no
customer rows or credentials. If COMMIT's response is lost, the workflow reports
an unknown outcome: inspect the singleton installation ledger and database
catalog read-only before any retry. Never manually rerun these three migrations
or delete the ledger to get around a failed guard. If a post-commit API check or
evidence upload fails, the migration may already be installed; the ledger is the
authoritative outcome, not the overall workflow colour.

## Acceptance after installation

Verify the installed ledger/catalog and private API isolation, regenerate the
database type contract, and run the advisor/exact RPC audit. Then complete actual
signed JWT/refresh, positive and negative tenant/school/role, invitation,
revocation/realtime and native ingestion acceptance described in
[commercial-security-remediation.md](commercial-security-remediation.md).
The SQL checks and embedded PostgreSQL tests do not prove these real API paths.
Do not deploy the frontend or close the commercial findings until their required
evidence passes.

Current primary references: [Supabase backups](https://supabase.com/docs/guides/platform/backups),
[connecting with verified SSL](https://supabase.com/docs/guides/database/psql),
[backup/restore compatibility](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html).
