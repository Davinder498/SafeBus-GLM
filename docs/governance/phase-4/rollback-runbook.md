# Application and database recovery runbook

## Decision rule

Stop rollout for authorization leakage, failed login, corrupt writes,
incompatible schema, missing security headers, or a critical/high vulnerability.
Assign an incident lead and preserve the release SHA and workflow logs. Do not
improvise destructive SQL.

## Application rollback

1. Identify the last known-good immutable production Git SHA.
2. Run **Actions → Roll back release**, enter the SHA and
   `ROLLBACK_PRODUCTION`, then approve the protected environment prompt.
3. The workflow rebuilds, retests, checks for source maps, and redeploys that
   source. It does not alter the database.
4. Verify login, one guardian boundary, one driver boundary, response headers,
   and error monitoring. Record timestamps and deploy IDs.

Netlify prior-deploy restore is an authorized emergency fallback. Rebuilding the
immutable SHA is preferred because it repeats validation and produces evidence.

## Database recovery

No automated production schema deployment is allowed in the current
single-database model. Never edit an adopted migration, run a down migration, or
test a corrective migration directly against production.

For suspected corruption, freeze writes and invoke the approved Supabase
backup/PITR process. Restore into a temporary isolated Canadian recovery target,
validate authorization and row counts there, and obtain incident-lead plus
privacy/security approval before any cutover. Creating that recovery target is
an incident-recovery action, not approval for routine development or staging.

## Recovery exercise

At least quarterly:

1. Record the production schema fingerprint and application SHA.
2. Roll the application from a harmless reviewed version to the recorded SHA.
3. Confirm the schema is unchanged and read-only drift verification passes.
4. Restore the latest backup into an isolated Canadian recovery target and run
   read-only integrity checks plus approved authorization tests there.
5. Record recovery point, recovery time, tester, workflow evidence, and secure
   deletion of the temporary restore.

The exercise is incomplete until its evidence and cleanup are reviewed.
