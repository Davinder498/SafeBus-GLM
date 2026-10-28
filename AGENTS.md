# SafeBus Alberta Agent Instructions

SafeBus Alberta is a school transportation operations and live bus visibility platform.

SafeBus serves Alberta schools and school authorities only.

Use **School authority** for the customer account and **School authority admin**
for its primary administrator in user-facing text. Preserve each authority's
actual name, including Division, District, Board, or Conseil scolaire. One school
authority can manage multiple schools and shared transportation operations.
Bus carriers are distinct from the school authority that manages the account.
Keep existing internal tenant identifiers, API contracts, and authorization roles
unless a separately scoped migration explicitly changes them.

It is not a PowerSchool replacement.
It is not a full school management system.

Core product principle:

> Track the bus, not the child.

## Required launch behavior — owner direction, 2026-10-24

SafeBus must work as a real, usable service for every newly onboarded school
authority and school authority admin. Do not deliver accounts with shipped
features silently disabled by development defaults, undocumented switches, or
repeated manual approvals. Fix the provisioning defaults and verify the resulting
behavior; changing a label or recording an approval in a document is not a fix.

- Normal invitation acceptance, authentication/MFA, subscription or trial terms,
  bus allowance, role permissions, and school authority data boundaries remain.
  “Full app” means all shipped features permitted by those normal rules; it does
  not mean bypassing billing, authentication, RLS, or another person's consent.
- The owner has approved the standard notification privacy setup. New school
  authorities must receive notification availability automatically. Do not
  require a separate owner/platform privacy approval for each new account.
- School authority notification availability is separate from each guardian's
  and driver's choices and Android permission. Preserve personal opt-outs, quiet
  hours, authorization checks, rate limits, and intentional school authority
  pauses. Do not auto-subscribe people or send test notifications to real users.
- Repair existing accounts left incomplete by the old provisioning defaults with
  a bounded, reviewed change. Preserve deliberate pauses and rejected policies;
  do not blanket-enable every existing school authority.
- Verify the complete new-account journey and the actual provider configuration
  required by shipped features. A missing email, push, billing, or map service
  configuration is a platform issue to resolve, not a permanent customer-facing
  “awaiting approval” state. Report any concrete remaining dependency plainly.
- An instruction edit, local fixture test, or open pull request alone does not
  prove that the live app works. Distinguish implemented, tested, and live-verified
  behavior, and never claim launch completion while required work is pending.

This direction supersedes older requirements for per-school-authority manual
notification privacy approval, including historical milestone documents. It
authorizes implementing the onboarding/default fixes and bounded verification
against the existing BusSafe database. The existing BusSafe project is the
approved target for these launch-default fixes; a separate DEV/staging database
is not a prerequisite. Reconcile the hosted schema, rehearse a bounded change
with rollback, and retain recovery evidence before its reviewed rollout.
It does not authorize inventing completed
legal/vendor evidence, merging without human review, destructive testing, or
bypassing the protected software release workflow. Do not ask the owner to
repeat the standard notification privacy approval already given.

## Workflow

- Work one milestone at a time.
- Do not implement future milestones early.
- Do not push directly to `main`.
- Use feature branches.
- Open a pull request for review.
- Do not merge without human approval.
- GLM may build.
- Codex reviews.
- Human approves final merge.

### Standing service authorization — owner direction, 2026-10-28

- The owner authorizes task-related changes in the existing SafeBus Supabase,
  GitHub, Netlify, and Stripe accounts. Use available connected tools, APIs, CLIs,
  or computer use as needed without requesting repeated permission for those
  already-authorized changes.
- Use the actual permissions of the connected accounts. Report a concrete access
  or credential problem if it prevents the requested work; do not claim access
  that has not been verified.
- Continue the feature-branch, human merge review, recovery, and protected
  production release workflow. This authorization does not remove account
  security, required deployment reviewers, recipient consent, or data boundaries.

## Current Development Setup

- The existing hosted `BusSafe` Supabase project is the sole database and is production.
- No DEV or staging database is currently approved.
- Do not run Docker commands.
- Do not run `supabase start`.
- Do not run `supabase db reset`.
- Keep SQL migrations in `supabase/migrations`.
- Pending changes require an approved target and reviewed rollout. The
  owner-authorized launch-default fixes above may use the existing BusSafe
  project; do not require a second database for that work.
- Do not run RLS tests or QA seed/fixture writers against production.
- Modify production only through the protected, approved adoption/release workflow.

### Customer-authorized existing-database verification (2026-09-18)

The customer explicitly requires use of the existing database and declines an
additional environment. This supersedes the blanket restriction above for
reviewed, bounded verification only:

- Run read-only authorization checks with `BEGIN TRANSACTION READ ONLY`, local
  statement/lock timeouts, transaction-local roles/claims, and final `ROLLBACK`.
- `tests/rls/guardian-existing-database-readonly.sql` is the initial reviewed check.
- Keep the database production-designated. Do not spoof a development identity or
  weaken the destructive fixture runner's environment guards.
- Before any fixture-writing test, inspect its statements and called triggers for
  persistent changes, external effects, locks, and interaction with existing data.
  Use uniquely scoped synthetic fixtures and one rollback-only transaction; never
  alter existing records, disable security controls, or send notifications as QA.
- This authorization does not authorize resets, destructive/load testing, blanket
  migration replay, or bypass of the protected production release workflow.

### Customer-authorized prelaunch security verification (2026-10-10)

The customer confirms there are no external users or commercial tenants and
explicitly approves using the existing BusSafe project for the reviewed security
fixes and controlled tests. An additional test project is optional for this work.
This supersedes the isolated-target requirement for this security milestone.

- Keep the project production-designated and preserve its existing data.
- Prepare and review the hosted-schema reconciliation before applying changes.
- Rehearse schema changes in a bounded rollback-only transaction first.
- Persistent changes still require verified recovery evidence and the protected,
  approved workflow. GitHub environment protection and human merge review remain.
- Inspect fixtures and triggers before test writes; use scoped synthetic accounts.
- Do not reset the database, replay all migrations, alter existing identities as
  fixtures, send notifications as QA, or perform uncontrolled load testing.
- This approval is not commercial launch approval or authorization to merge a new
  pull request without review.

## Account preferences and interface copy

- Owner direction, 2026-10-26: guardian and driver notification preferences belong
  to each recipient. Retire school-authority delivery/push preference switches
  from delivery decisions and disable their legacy mutation endpoints. This
  supersedes preservation of school-authority preference pauses above. Preserve
  recipient opt-outs, device permissions, quiet hours, authorization, quotas,
  account suspensions and platform privacy rejection. Do not auto-subscribe people.
- Use consistent notification labels across inbox filters and preferences:
  Pickup & drop-off, Trip updates, Assignment alerts, and Operational alerts.
  Show only categories relevant to the current role. Preserve internal category
  identifiers; `operations` and `service_changes` share Operational alerts in
  the interface and must use the same saved preference group.
- School authority broadcasts belong to Operational alerts. Keep composing and
  sent history on Announcements, separate from each administrator's personal
  inbox preferences. Do not present Android push as an administrator device
  capability or mix recipient delivery policy into personal preferences.
- Broadcast audience selection, counts, history, and delivery must enforce the
  sender's school authority and school scope on the server. Preserve recipient
  opt-outs and device permissions, and deduplicate retried sends. Never send
  real announcements or external notifications as QA.

- Ordinary guardian and driver notification choices must save with an active,
  valid session, without a recent-sign-in prompt. Preserve ownership, tenant,
  account-status, device-permission, and enabled-channel checks.
- Changes to guardian/student access, account security, roles, and credentials
  retain their appropriate verification requirements.
- Guardians and drivers can opt into MFA in account settings. Once enrolled,
  verify MFA at sign-in and enforce it server-side. Require a fresh authenticator
  code before removing an enrolled authenticator. Administrator MFA stays required.
- Prefer headings, labels, values, and controls in cards. Do not add repetitive
  card subtitles, per-option descriptions, implementation explanations, or generic
  instructional cards. Keep essential task instructions, errors, live statuses,
  permissions/disclosures, and destructive or billing-action consequences.

## Frontend Environment

Frontend may only use:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Never expose service role or secret keys in frontend code, `.env`, docs, logs, or screenshots.

## Branding

- Use the text-only `SafeBus` wordmark on every web and mobile screen, including sign-in, loading, errors, and splash screens.
- Use the existing brand blue on light surfaces and white on dark surfaces. Do not use yellow lettering in the wordmark.
- Reserve the bus artwork for the Android launcher and store app icon. Do not reintroduce it into screen branding, splash artwork, web icons, or marketing screenshots.

## Privacy Rules

- Do not add Alberta Student Number.
- Do not add `asn`.
- Do not add `alberta_student_number`.
- Do not add student home address.
- Do not add student health data.
- Do not expose full student lists to guardians.
- Guardians can only see their linked students.
- Drivers should only see their own or assigned data.
- Do not bypass RLS.
- Do not add public policies.
- Do not add service-role frontend logic.

## Current Architecture

- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Supabase Auth
- Supabase Postgres
- Supabase RLS
- Sole hosted Supabase production project; no non-production database

## Current Active Migrations

Use `supabase/migration-checksums.json` for the current tracked migration chain;
the original five foundation migrations are not the full current schema.
The hosted project also has reviewed reconciliation records. Inspect the actual
hosted schema and release evidence before preparing a forward change. Never
replay the migration chain to make the hosted project match the repository.

Changes in `supabase/migrations/pending` are prepared changes, not proof of
deployment. Keep new forward changes there until their promotion/release is
reviewed through the existing workflow.

Legacy archived migration:

- `supabase/legacy/0004_hosted_schema_alignment.sql`

Do not apply the legacy migration to clean dev/staging/production databases.

## Scope Control

Do not add these unless the milestone explicitly asks:

- live GPS
- maps API
- QR codes
- student badges
- pickup/drop-off scan events
- notifications
- SMS
- trips
- CSV import
- PowerSchool integration
- SchoolEngage integration
- production deployment

## Required Validation

Before final report, run:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

After every completed set of changes, also run the mobile build followed by the
Android sync, including changes outside the mobile app:

```bash
pnpm --filter @safebus/mobile build
pnpm --filter @safebus/mobile cap:sync
```

Run sync only after the mobile build succeeds so Android receives the current
bundle. If subsequent edits change the bundle or native configuration, build and
sync again. Report the result of both commands; do not describe a build or sync
as an APK/AAB installation, Play publication, or physical-device verification.
