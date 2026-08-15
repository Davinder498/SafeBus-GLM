# SafeBus Alberta — Development Workflow

**Status:** Confirmed (codifies `AGENTS.md` + Phase 0 requirement)
**Owner:** Engineering Lead
**Phase:** 0 — Product and governance baseline
**Last updated:** 2026-08-06

---

## 1. Purpose

Phase 0 requires the development workflow to be **confirmed**:
- Feature branches only
- No direct changes to `main`
- One milestone at a time
- GLM may build
- Codex reviews
- Human approves merging

This document is the canonical statement; it mirrors and is enforced by
`AGENTS.md`. Where any conflict exists, `AGENTS.md` repo rules win on repo
mechanics and this document wins on milestone/phasing governance.

## 2. Branching

- All work happens on **feature branches** named after the milestone or
  phase, e.g. `phase-0-product-and-governance-baseline`,
  `phase-1-database-authorization-repair`.
- **No direct commits to `main`.** This is enforced by protected branches in
  Phase 4 and by reviewer convention immediately.
- Branches are short-lived: one milestone, one branch, one PR.

## 3. One milestone at a time

- Do **not** implement future milestones early. The feature inventory
  ([`feature-inventory.md`](./feature-inventory.md)) is the arbiter.
- Do **not** mix scope. A Phase 1 PR must not also add Phase 5 features.
- If a PR discovers prior scope drift, record it in the decision log and
  either quarantine or formally promote — never silently expand scope.

## 4. Roles in the workflow

| Step | Who | Tooling |
| --- | --- | --- |
| Build | GLM (or an engineer) on a feature branch | Local dev + hosted Supabase DEV |
| Review | Codex (automated review) + at least one human reviewer | Pull request |
| Validate | Anyone — `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` | Required validation in `AGENTS.md` |
| Approve & merge | Human only — never GLM alone | Protected `main` |

## 5. Required validation before final report

Per `AGENTS.md`, the following must pass before a milestone is reported as
complete:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

RLS execution against a database uses the guarded runner:

```bash
SAFEBUS_RLS_TEST_DATABASE_URL=postgresql://... \
SAFEBUS_RLS_TEST_CONFIRM=DEV_ONLY \
pnpm test:rls:dev
```

- `pnpm test:rls` is **structural only** (checks files exist); it is not
  proof that SQL assertions passed. Never report it as execution evidence.
- Never run RLS SQL or QA seed scripts against production.
- Under DL-013 no non-production database exists, so this hosted runner is not
  currently available. Do not set its URL to the sole production database.

## 6. Database change rules (from `AGENTS.md`)

- The existing hosted Supabase project is production. No hosted DEV database is
  currently approved.
- Do **not** run Docker commands. Do **not** run `supabase start`. Do **not**
  run `supabase db reset`.
- Keep migrations in `supabase/migrations`.
- Do not apply a migration until an isolated validation target is separately
  approved; pending migrations fail the production release closed.
- Do **not** modify production outside the protected adoption/release workflow.
- Do **not** rename migrations already applied to a database (see
  `decision-log.md` DL-005).

## 7. Frontend environment rules

- Frontend may only use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Never expose service-role or secret keys in frontend code, `.env`, docs,
  logs, or screenshots.

## 8. Privacy rules (enforced, not aspirational)

- No Alberta Student Number / `asn` / `alberta_student_number`.
- No student home address. No student health data.
- No custody narratives.
- Guardians only see their linked students.
- Drivers only see their own/assigned data.
- Do not bypass RLS. Do not add public policies. Do not add service-role
  frontend logic.

## 9. Scope control (enforced)

Do not add these unless a milestone explicitly asks (see `feature-inventory.md`):
live GPS beyond active trips, maps API selection for production, QR codes as a
boarding system, student badges, pickup/drop-off scan events, notifications
beyond approved MVP, SMS, trips beyond the approved model, CSV import beyond
student-only, PowerSchool/SchoolEngage/SIS integration, production deployment.

## 10. Definition of done for a milestone

A milestone is done when **all** of the following are true:

1. Code is on a feature branch and a PR is open.
2. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all pass.
3. Any RLS/SQL change remains blocked until an isolated validation target is
   explicitly approved; production is never used as that target.
4. The relevant phase exit-gate items are satisfied and recorded.
5. Codex/human review is complete.
6. A human approves and merges to `main`.
7. `docs/MILESTONE_STATUS.md` is updated.

## 11. Changes to this document

Workflow changes require a `decision-log.md` entry.
