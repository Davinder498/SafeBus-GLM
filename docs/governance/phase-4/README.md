# Phase 4 — Secure development and deployment platform

**Status:** Repository controls implement the single-production-database
decisions in DL-013 through DL-015. Production adoption and its current backup
evidence are deferred to the final prelaunch sequence. Credential rotation,
rollback evidence, and final security approval remain operator gates.

## Locked environment model

The existing Supabase project `BusSafe` is the sole database and production
system of record. It is not DEV or staging. SafeBus will not create another
database under the current approved decision.

The existing `bussafe` Netlify site is the production application target. Any
unused non-production site must have no production database credentials.

The conversion preserves the existing public schema and data. It does not reset
the database or replay historical migrations. Follow
[`environment-conversion-runbook.md`](./environment-conversion-runbook.md).

DL-015 changes only the order of work. Point 4 remains open, production release
remains blocked, and the adoption workflow must not run until every existing
backup and confirmation gate is truthfully satisfied. Other readiness work may
continue only where it does not mutate production or depend on an adopted
release ledger.

The Supabase project, backups, and material processors must remain in the
approved Canadian region (`ca-central-1`). Retain dashboard and recovery
evidence with the release record.

### Free-plan construction posture

The Platform Administrator approved Supabase Free while SafeBus is being built.
This permits engineering, demonstrations, and a labelled prelaunch/beta site.
It does not authorize a commercial uptime or recovery promise. Because the Free
plan does not supply the approved automatic backup posture, adoption requires a
current manual logical backup, integrity evidence, and the explicit
`FREE_PRELAUNCH_ONLY` acknowledgement. Upgrade becomes a launch gate before a
school's real operational use or a paid availability/recovery commitment.

## Safe release model

- Pull requests run typecheck, lint, build, unit/contract tests, browser smoke
  tests, migration-manifest verification, dependency audit, secret scanning,
  and CodeQL without connecting to production.
- `pnpm release:preflight` uses a read-only production transaction. It verifies
  the exact reviewed 40-character commit, migration ledger and schema drift,
  generated database types, dependencies, build output, and browser tests.
- A successful preflight produces a two-hour attestation bound to the commit,
  exact database/API project, migration manifest, generated types, dependency
  inputs, and built application artifact.
- `pnpm migrations:deploy` verifies the attestation and records an
  application-only production release. It refuses to continue if any schema
  migration is pending.
- A populated database without private `safebus_release` metadata is never
  initialized automatically. The protected one-time adoption workflow is the
  only approved baseline path.
- The schema fingerprint covers relations, columns, constraints, indexes, RLS,
  policies, functions, triggers, grants, schema grants, enums, and Realtime
  publication controls.

### Schema-change stop condition

There is no isolated database on which to prove a migration safely. Therefore,
any new migration blocks production release before database mutation. Work on a
schema-changing release may resume only after the Platform Administrator
explicitly approves an isolated test database or Supabase branch and its
validation process. This does not create such an environment automatically.

### Destructive-test stop condition

RLS and QA fixture runners accept only a database permanently registered as
`development` or `staging`. Once the sole database is registered as
`production`, they reject it even if an operator supplies a misleading label.
CI has no production database credential and does not execute hosted RLS SQL.
Historical hosted RLS evidence remains evidence for the schema already adopted;
future authorization changes trigger the schema-change stop condition.

## Protected GitHub production environment

Only the `production` environment may hold database and deployment values. It
must require a human reviewer, prevent self-review, and contain:

| Name                     | Kind     | Purpose                                        |
| ------------------------ | -------- | ---------------------------------------------- |
| `SAFEBUS_DATABASE_URL`   | Secret   | Direct production Postgres connection          |
| `SUPABASE_SECRET_KEY`    | Secret   | Server-only read credential for type checks    |
| `VITE_SUPABASE_ANON_KEY` | Secret   | Public browser client key                      |
| `NETLIFY_AUTH_TOKEN`     | Secret   | Deployment token scoped to the production site |
| `VITE_SUPABASE_URL`      | Variable | Production Supabase API URL                    |
| `NETLIFY_SITE_ID`        | Variable | Production `bussafe` site ID                   |

Server-only credentials must never enter frontend settings, local files,
repository variables, logs, screenshots, or documentation. The `development`
and `staging` GitHub environments must not contain a database URL or Supabase
server secret for the sole production project.

## Production release

1. Confirm the exact commit passed required pull-request checks and was reviewed.
2. Run **Actions → Release production → Run workflow**.
3. Enter the full 40-character reviewed SHA and `DEPLOY_PRODUCTION`.
4. Approve the protected production environment prompt.
5. The workflow performs read-only preflight, rejects pending schema changes,
   records the release, deploys the attested artifact, and retains evidence.

No operator runs migration SQL from a laptop. A failed preflight leaves the
database unchanged.

## Required branch protection

Protect `main` with pull requests, at least one approving review, dismissal of
stale approvals, resolved conversations, enforcement for administrators, and:

- Typecheck, lint, and build
- Unit tests
- Browser smoke tests
- Migration verification
- Dependency audit
- Secret scanning
- CodeQL JavaScript and TypeScript

Disable force pushes and branch deletion. Human approval remains the final
merge and production-release gate.

## Evidence still requiring an operator

Repository checks cannot prove backups, recovery, reviewer configuration,
credential rotation, deployed headers, or cloud residency. Keep the completed
security checklist, production workflow URL, rollback workflow URL, Supabase
region/backup evidence, and recovery evidence with the release record.
