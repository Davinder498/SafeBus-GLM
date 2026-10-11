# Existing-project security rehearsal

The customer approved the existing BusSafe project on 2026-10-10 after confirming
that the application has no external users or commercial tenants. The database
remains production-designated. This approval supersedes the separate-project
requirement for this security milestone; human PR review, environment protection,
recovery requirements, and restrictions on resets/load tests remain.

## Reviewed approach

PR #252 was merged by the customer. Migration 0122 is still unapplied: the hosted
database does not have its private-helper baseline. Do not run 0122 alone or
replay the older migration chain.

Migration 0123 prepares a snapshot-specific authorization reconciliation. It
preserves the current 180 public RPC signatures, moves 110 internal routines,
rewrites stored qualified calls, preserves policy/trigger OIDs, and removes
anonymous execution. The existing private audit wrapper is preserved; its public
implementation becomes a separately named private legacy implementation to
avoid a collision or recursion. The exact function definitions and grants are
pinned to the reviewed hosted snapshot. A changed snapshot fails closed.

The rehearsal runs 0123 first, then immutable 0122, then the reviewed SQL
catalog/negative checks, in ONE bounded transaction that ALWAYS ROLLBACKs.
That special bootstrap order is limited to this unadopted hosted snapshot.
On normally hardened databases, 0123 leaves the existing baseline unchanged.
This is not authorization to bypass the chronological migration ledger in a
persistent release or to pretend earlier migrations were applied.

The script verifies the catalog after rollback, including private/public function
definitions and grants, policies, triggers, column grants, schema grants, and the
PostgREST hook configuration. It has no commit mode, fixture-writing mode, Auth
account creation, historical checksum adoption, or frontend deployment.
Statements have local timeouts; the workflow shares the production release
concurrency group and uses the protected production environment.

Code validation runs first in a separate job without database credentials. The
mobile build regenerates tracked brand PNGs, whose output can differ by platform.
The protected database job therefore checks out the same reviewed SHA on a fresh
runner after validation passes; it never runs the build or tests there. The
script still rejects every tracked change before connecting. Do not ignore asset
changes in that guard or reset tracked files to conceal unexpected modifications.

Before connecting for DDL, the script requires an actual Data API PGRST106
rejection of safebus_private using the project's valid anon/publishable key.
An invalid key, an outage, or a reachable private schema fails closed.
The request uses GET on a deliberately nonexistent REST relation with limit=0;
it reads no application rows. The OpenAPI root /rest/v1/ is not a suitable public
key probe because the hosted gateway reserves that endpoint for secret keys.
Failures report the bounded stage, error code, HTTP status, and PostgREST code
when available. Raw response bodies, SQL details, and credentials stay out of logs.

## Run after human review and merge

1. Review and merge the feature PR. The production environment allows protected
   branches only and requires a reviewer; do not modify those protections.
2. Dispatch .github/workflows/rehearse-existing-security.yml from main with
   the full reviewed commit SHA and
   REHEARSE_EXISTING_SECURITY_ROLLBACK_ONLY as confirmation.
3. Complete the existing GitHub production-environment review. The script uses
   the existing database connection secret inside that protected job.
4. Inspect the workflow result and restricted seven-day evidence artifact. PASS
   means the SQL catalog/negative checks passed in the temporary transaction and
   the inspected catalog was restored. A failure rolls back and needs diagnosis.

The local machine has no approved direct database connection secret. The
Supabase connector can inspect catalogs, but it is not a substitute for the
protected release workflow when executing these schema changes.

## Evidence still required before persistent application

- Successful hosted rollback rehearsal and reviewed findings.
- A verified recoverable backup/export; the catalog artifact is NOT a complete
  database backup and does not establish full restoration.
- The honest protected adoption/reconciliation sequence and historical drift
  handling. Current production adoption records only the 0088 historical
  baseline; later hosted effects must not be falsely recorded as replayed.
- A reviewed persistent release mechanism with backup evidence and exact commits.
- Real signed JWT/refresh-token, positive/negative role, tenant/school, native
  ingestion, invitation activation, and realtime lifecycle acceptance. These
  cannot be proven by this rollback-only catalog rehearsal.

No separate project or paid upgrade is required for this rehearsal. The Free
project is not a capacity benchmark for 10,000 buses or commercial launch approval.
