# Phase 4 — Secure development and deployment platform

**Status:** Repository controls implemented; cloud provisioning, protected
environment approval, staging deployment, rollback exercise, and final security
approval require authorized operators.

## Release model

SafeBus uses three isolated Supabase projects and three isolated Netlify sites.
No database, key, site ID, or deploy credential is shared between environments.

| Environment | Purpose                                    | Data                  | Deployment authority                                            |
| ----------- | ------------------------------------------ | --------------------- | --------------------------------------------------------------- |
| DEV         | Engineering and destructive RLS regression | Synthetic only        | Developers; migrations remain manually applied to hosted DEV    |
| Staging     | Release candidate and rollback validation  | Synthetic only        | `Release staging` workflow after protected-environment approval |
| Production  | Approved customer workload                 | Real operational data | `Release production` workflow after mandatory human approval    |

Supabase projects and any storage/processing subprocessor used by SafeBus must
be provisioned in the approved Canadian region (`ca-central-1`). An operator
must record region evidence in the release checklist before the environment can
be approved. A Canadian application host does not compensate for a database or
subprocessor outside the approved region.

## Reproducible release controls

- `pnpm install --frozen-lockfile` and the pinned pnpm, Node, and Supabase CLI
  versions make dependency and schema tooling repeatable.
- `supabase/migration-checksums.json` records SHA-256 and byte length for every
  canonical migration. `pnpm migrations:verify` rejects edits, gaps, unexpected
  collisions, or missing manifest updates. The documented immutable `0058`
  collision is the only exception.
- `pnpm release:preflight` performs every release check against the exact
  40-character reviewed commit before schema deployment. It verifies migration
  checksums, inspects database drift without writing, checks generated database
  types, runs typecheck, lint, unit/contract tests, dependency audit, production
  build, source-map rejection, and browser smoke tests.
- A successful preflight creates a two-hour attestation bound to the commit,
  database target, migrations, lockfile, generated database types, and built web artifact.
  `pnpm migrations:deploy` refuses to connect to the database when this evidence
  is missing, stale, targets another environment, or no longer matches the files.
- `pnpm migrations:deploy` applies the release ledger and every pending migration
  in one transaction. If any migration or fingerprint step fails, PostgreSQL
  rolls back the whole release rather than leaving a partially applied schema.
  The command runs only in GitHub Actions for staging or production and requires
  an environment-specific confirmation value.
- A deterministic public-schema fingerprint covers relations, columns,
  constraints, indexes, RLS settings and policies, functions, triggers, and
  grants. `pnpm migrations:drift` rejects out-of-band changes.
- `pnpm types:generate` reads the authoritative hosted public-schema metadata
  through a protected server-only key (with the pinned Supabase CLI available
  as a direct-database or management-token fallback). `pnpm types:check` fails
  a release when the committed
  `packages/types/src/database.generated.ts` differs from staging or
  production.
- Staging and production accept only an explicit full reviewed Git SHA. The web
  artifact is built and tested once during preflight; that same attested artifact
  is deployed. Build output containing `.map` files is rejected.

### Fail-closed database rules

Release preflight opens a read-only transaction. It cannot create the release
ledger or alter application data. A deployment is rejected before persistent
database changes when it finds a changed migration, an unknown or missing
migration, schema drift, incomplete release tracking, or invalid preflight
evidence.

A populated database without a `safebus_release` ledger is also rejected. This
protects the existing hosted SafeBus database from accidentally replaying all
historical migrations. The explicit one-time adoption of that existing database
belongs to the environment-conversion decision; the release command never
guesses that historical migrations were applied.

## Required GitHub environments

Create `development`, `staging`, and `production` environments. Configure
staging and production with required reviewers and prevent self-review.
Production secrets must be entered directly into the protected environment by
an authorized operator; they must not be copied into developer machines,
repository variables, logs, screenshots, or frontend configuration.

Each environment uses these names:

| Name                     | Kind     | Notes                                                                    |
| ------------------------ | -------- | ------------------------------------------------------------------------ |
| `SAFEBUS_DATABASE_URL`   | Secret   | Direct Postgres credential for that environment only                     |
| `SUPABASE_SECRET_KEY`    | Secret   | Server-only key used for read-only hosted schema type generation         |
| `VITE_SUPABASE_ANON_KEY` | Secret   | Public client key, separated to prevent accidental cross-environment use |
| `NETLIFY_AUTH_TOKEN`     | Secret   | Deployment token scoped to the target site/team                          |
| `SUPABASE_PROJECT_ID`    | Variable | Environment-specific project reference                                   |
| `VITE_SUPABASE_URL`      | Variable | Environment-specific public API URL                                      |
| `NETLIFY_SITE_ID`        | Variable | Environment-specific site                                                |

DEV additionally supplies `SAFEBUS_DATABASE_URL` to the `RLS execution` CI
job. The runner also requires `SAFEBUS_RLS_TARGET=development` or `staging` and
rejects any other label. RLS scripts are destructive and must never target
production.

## One-click staging release

1. Confirm the commit passed all pull-request checks and was reviewed.
2. Run **Actions → Release staging → Run workflow**.
3. Enter the full 40-character reviewed commit SHA.
4. The protected environment approval pauses the job for its human reviewer.
5. The job completes read-only and application preflight, writes evidence tied
   to the tested artifact, atomically deploys schema, executes real staging RLS
   assertions, deploys that same artifact, and retains evidence for 30 days.

No operator runs migration SQL from a laptop. A failed preflight makes no
persistent schema change. A failed migration rolls back all schema changes from
that release and stops before the application is deployed.

## Required branch protection

Protect `main` with pull requests, at least one approving review, dismissal of
stale approvals, resolved conversations, enforcement for administrators, and
these required checks:

- Typecheck, lint, and build
- Unit tests
- Browser smoke tests
- Migration verification
- RLS execution
- Dependency audit
- Secret scanning
- CodeQL JavaScript and TypeScript

Disable force pushes and branch deletion. Do not enable automatic merge for a
Phase 4 release. Human approval remains the final merge gate.

## Evidence and unresolved operational gates

Repository checks prove configuration and code behavior. They cannot prove a
cloud project was created in Canada, an environment reviewer was assigned, a
backup can be restored, or a deployed response has the intended headers. Keep
the completed security checklist, staging workflow URL, rollback workflow URL,
Supabase region evidence, and recovery evidence with the release record.
