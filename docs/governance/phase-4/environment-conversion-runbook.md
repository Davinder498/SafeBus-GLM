# Adopt the existing Supabase project as production

**Decisions:** DL-013 through DL-015. **Authority:** Platform Administrator.

**Sequencing:** DL-015 defers sections 2.1–2.2 and section 4 to the final
prelaunch sequence. Do not run the adoption workflow or claim Point 4 complete
before a current encrypted backup and all existing confirmations are verified.
The deferral does not authorize production mutation, real school operations,
or a commercial launch. Independent readiness work may continue.

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

1. While the project remains on Supabase Free, create the Supabase-recommended
   roles, schema, and data logical dumps from a trusted operator machine. Do not
   place the connection string in shell history, logs, or files. Encrypt the
   dump set, store it outside the repository, record SHA-256 checksums, and
   retain a non-secret 12–160 character evidence reference. Storage objects, if
   later introduced, require a separate backup because database dumps contain
   only their metadata.
2. Verify that every dump exists, is non-empty, and matches its recorded hash.
   A full recovery exercise remains a commercial-launch gate.
3. Inventory approved QA identities/fixtures. The adoption workflow refuses any
   `@example.test` Auth or profile identity. Remove only data that the Platform
   Administrator confirms is test data; never infer that operational data is
   disposable.
4. Rotate the database password and server credentials previously used on
   developer machines or in a development environment. Remove obsolete copies.
5. Record the exact reviewed Git SHA whose generated database contract matches
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
2. Enter `ADOPT_EXISTING_PRODUCTION`, `BACKUP_VERIFIED`,
   `FREE_PRELAUNCH_ONLY`, the non-secret backup evidence reference, and
   `CA_CENTRAL_1_VERIFIED`.
3. Approve the protected production environment prompt.
4. Retain the adoption artifact. The workflow performs read-only checks first,
   rejects known QA identities, locks and fingerprints the public schema, then
   adds only private `safebus_release` identity and ledger records atomically.
   It records only the immutable adoption baseline ending at migration `0088`.
   Later migrations remain pending; adoption never marks them applied. It does
   not execute migration SQL or write public application tables.
5. Run normal read-only production preflight and confirm the adopted migration
   ledger and schema fingerprint match.

## 5. Ongoing operating rule

- Application-only releases may use the protected production workflow.
- Supabase Free is limited to construction and explicitly labelled prelaunch or
  beta operation. Do not promise commercial uptime or recovery on this tier.
- Any pending database migration blocks release.
- Hosted RLS and QA fixture writers remain unavailable because there is no
  approved non-production database.
- A schema-changing release requires a new explicit Platform Administrator
  decision approving an isolated test database or Supabase branch first.

## Exit gate

Point 4 database adoption is complete when production region, current manual
backup integrity, QA cleanup, credential rotation, protected-secret, adoption,
and read-only preflight evidence are retained. Commercial launch additionally
requires a tested recovery path and a service tier capable of the approved
availability and backup commitment.
