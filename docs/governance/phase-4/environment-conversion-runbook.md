# Adopt the existing Supabase project as production

**Decision:** DL-013. **Authority:** Platform Administrator.

The existing `BusSafe` Supabase project is the sole database and production
system of record. Do not create DEV or staging databases. Do not reset it,
replay historical migrations, run hosted RLS tests against it, or seed QA data.

## 1. Freeze and classify

1. Stop manual migrations, QA seeds, and destructive RLS execution.
2. Remove its database URL and server secret from development/staging CI,
   developer machines, and unused deployment targets.
3. Confirm the project reference and `ca-central-1` region in the Supabase
   dashboard and retain evidence.
4. Treat all data and credentials from this point forward as production.

## 2. Protect the production data

1. Enable the approved backup/PITR plan and complete a recovery exercise.
2. Inventory approved QA identities/fixtures. The adoption workflow refuses any
   `@example.test` Auth or profile identity. Remove only data that the Platform
   Administrator confirms is test data; never infer that operational data is
   disposable.
3. Rotate the database password and server credentials previously used on
   developer machines or in a development environment. Remove obsolete copies.
4. Record the exact reviewed Git SHA whose generated database contract matches
   the hosted schema.

## 3. Configure protected production

1. Configure the GitHub `production` environment with a required reviewer and
   prevent self-review.
2. Enter `SAFEBUS_DATABASE_URL`, `SUPABASE_SECRET_KEY`,
   `VITE_SUPABASE_ANON_KEY`, and `NETLIFY_AUTH_TOKEN` directly as protected
   secrets. Set `VITE_SUPABASE_URL` and the production `NETLIFY_SITE_ID` as
   protected variables.
3. Configure the existing `bussafe` Netlify site with the matching public
   Supabase URL/key. Never place database or server-secret credentials there.
4. Confirm unused preview/staging targets have no production credentials.

## 4. Adopt without rebuilding

1. Run **Adopt existing database as production** for the exact reviewed SHA.
2. Enter `ADOPT_EXISTING_PRODUCTION`, `BACKUP_VERIFIED`, and
   `CA_CENTRAL_1_VERIFIED`.
3. Approve the protected production environment prompt.
4. Retain the adoption artifact. The workflow performs read-only checks first,
   rejects known QA identities, locks and fingerprints the public schema, then
   adds only private `safebus_release` identity and ledger records atomically.
   It does not execute migration SQL or write public application tables.
5. Run normal read-only production preflight and confirm the adopted migration
   ledger and schema fingerprint match.

## 5. Ongoing operating rule

- Application-only releases may use the protected production workflow.
- Any pending database migration blocks release.
- Hosted RLS and QA fixture writers remain unavailable because there is no
  approved non-production database.
- A schema-changing release requires a new explicit Platform Administrator
  decision approving an isolated test database or Supabase branch first.

## Exit gate

Point 4 conversion is operationally complete only when production region,
backup/recovery, QA cleanup, credential rotation, protected-secret, adoption,
read-only preflight, and signed security-checklist evidence are retained.
