# Existing hosted project to production conversion

**Decision:** DL-013. **Authority:** Platform Administrator.

This runbook preserves the existing hosted Supabase public schema and data. Do
not reset it, replay historical migrations, run RLS tests against it, or copy
its real data into DEV/staging.

## 1. Freeze and evidence the existing project

1. Stop manual migrations, QA seeds, and destructive RLS execution against the
   existing project.
2. Confirm its Supabase region is the approved Canadian region
   (`ca-central-1`) and retain dashboard evidence.
3. Enable the approved backup/PITR plan and complete a recovery exercise before
   adoption. Retain the evidence.
4. Record the exact reviewed Git SHA whose generated database contract matches
   the hosted schema.
5. Inventory and remove approved DEV-only QA accounts/fixtures from the existing
   project. The adoption workflow refuses any `@example.test` Auth/profile
   identity. Retain the cleanup approval and result; do not remove real users or
   operational records.

## 2. Create replacement non-production systems

1. Create new DEV and staging Supabase projects in `ca-central-1`.
2. Use synthetic identities and transportation records only.
3. Apply canonical migrations manually to hosted DEV through SQL Editor, then
   run **Register development database identity** with the full approved SHA and
   `REGISTER_DEVELOPMENT`.
4. Replace the GitHub `development` environment's encrypted
   `SAFEBUS_DATABASE_URL` with the new DEV credential and add
   `VITE_SUPABASE_URL`. Confirm the RLS job passes against the registered DEV
   identity.
5. Create a separate staging Netlify site. Configure the protected `staging`
   GitHub environment with staging target values and DEV as its
   `CONTRACT_SUPABASE_URL`/`CONTRACT_SUPABASE_SECRET_KEY` source.
6. Run **Release staging** for the same reviewed SHA. An empty staging database
   is initialized atomically from canonical migrations, registered as staging,
   checked against DEV's generated contract, exercised with RLS tests, and
   deployed to the staging site.

## 3. Configure the preserved project as production

1. Treat the existing `bussafe` Netlify site as production and do not reuse its
   site ID for staging.
2. Rotate the existing project's database password and every server credential
   previously stored or used in development. Remove obsolete local copies after
   rotation. Do not put replacements in repository variables or local files.
3. Enter replacement values directly in the protected GitHub `production`
   environment: `SAFEBUS_DATABASE_URL`, `SUPABASE_SECRET_KEY`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `NETLIFY_AUTH_TOKEN`, and
   `NETLIFY_SITE_ID`.
4. Set production `CONTRACT_SUPABASE_URL`, `CONTRACT_SUPABASE_SECRET_KEY`, and
   `CONTRACT_DATABASE_URL` to the isolated staging project so production checks
   the already-promoted schema before mutation. The database credential is used
   by the one-time adoption workflow to compare the complete schema, including
   RLS, functions, triggers, and grants.
5. Configure the production Netlify runtime with matching Supabase values and
   approved server-only secrets. Confirm preview/staging contexts do not inherit
   production secrets.

## 4. Adopt without rebuilding

1. Run **Adopt existing database as production** for the exact reviewed SHA.
2. Type all three confirmations:
   `ADOPT_EXISTING_PRODUCTION`, `BACKUP_VERIFIED`, and
   `CA_CENTRAL_1_VERIFIED`.
3. Approve the protected production environment prompt.
4. Retain the 90-day adoption artifact. The workflow verifies checks first,
   locks and fingerprints the public schema, requires an exact match with the
   promoted staging fingerprint, rejects known QA identities, and adds only private
   `safebus_release` identity/ledger records in one transaction. It does not
   execute migration files or write public application tables.
5. Run read-only schema preflight and drift verification. Confirm every
   canonical migration checksum is recorded as the explicitly adopted baseline.

## 5. Exit gate

Point 4 operational conversion is complete only when:

- DEV, staging, and production project/site identifiers are distinct;
- all three Supabase projects have matching environment identities;
- DEV and staging contain synthetic data only;
- staging release and rollback evidence pass for the production SHA;
- production backup/region and credential-rotation evidence is retained;
- adoption evidence is retained and normal production preflight passes; and
- the production security checklist is signed.
