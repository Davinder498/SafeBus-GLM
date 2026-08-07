# Application and database rollback runbook

## Decision rule

Stop rollout immediately for authorization leakage, failed login, corrupt
writes, incompatible schema, missing security headers, or a critical/high
vulnerability. Assign an incident lead and preserve the failed release SHA and
workflow logs. Do not improvise destructive SQL.

## Application rollback

1. Identify the last known-good immutable Git SHA that was approved in the
   target environment.
2. Run **Actions → Roll back release** and choose staging or production.
3. Enter the known-good SHA and the exact confirmation value.
4. Approve the protected environment prompt. The workflow rebuilds, retests,
   checks for source maps, and redeploys that source. It does not alter the
   database.
5. Verify login, one guardian boundary, one driver boundary, response security
   headers, and error monitoring. Record timestamps and deploy IDs.

Netlify's prior-deploy restore may be used only as an emergency fallback by an
authorized operator. Rebuilding the immutable SHA is preferred because it
re-executes validation and produces reviewable evidence.

## Database recovery

Database migrations are forward-only. Never edit an applied migration and
never run a down migration against production.

- For a compatible defect, deploy a reviewed corrective migration through the
  normal protected release workflow, then roll the application forward.
- For destructive corruption, freeze writes and invoke the approved Supabase
  point-in-time recovery/backup procedure. Restore into an isolated Canadian
  recovery project first, validate RLS and row counts, then obtain incident
  lead and privacy/security approval before cutover.
- If application rollback is incompatible with the current schema, deploy a
  forward compatibility migration first. Prefer additive columns/functions
  and delayed removals so the previous application remains operable.

## Quarterly rollback exercise

Use staging and synthetic data only:

1. Record current schema fingerprint and application SHA.
2. Deploy a harmless reviewed release through `Release staging`.
3. Run `Roll back release` to restore the recorded application SHA.
4. Confirm the schema remains forward-compatible and `pnpm migrations:drift`
   passes against staging.
5. Restore the latest staging backup into an isolated Canadian recovery
   project; run migration verification, RLS execution, and browser smoke tests.
6. Record recovery point objective, recovery time, tester, workflow URLs,
   restored project deletion, and all discrepancies.

A rollback is not considered tested until this evidence is reviewed and the
restored project is securely removed.
