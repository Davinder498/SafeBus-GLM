# School authority onboarding review — 2026-10-24

## Findings

- The shared Field component renders its hint beside the label. The invitation
  email hint wraps the label and pushes its input below the adjacent name field.
  This wizard now places hints below their controls and connects them with
  `aria-describedby`, uses a bounded single-column form, and provides a step rail
  and editable review rows. Other forms retain their existing layout.
- `invitationRedirectUrl` caught both URL parsing failures and allowlist failures
  as an invalid-URL error. The handler then returned an unexplained 500. It now
  distinguishes invalid, unapproved and unverifiable redirects, fails closed
  before account lookup/email delivery, and returns safe 503 configuration errors.
- Read-only hosted verification found only `https://bussafe.netlify.app` in
  `allowed_redirect_origins`, with a platform-wide scope. The canonical
  `https://safebus.kids` returned false from `is_allowed_redirect_origin`.
  The owner-approved production redirect points to the canonical domain according
  to [the official-domain setup record](../operations/official-domain-setup.md).
  This mismatch reproduces the generic failure path seen in the supplied screenshot.
  Netlify function logs/configuration were not available in this session, so the
  exact request was not correlated to a runtime log.
- Exact-match checks found no school authority named `Test School District` and
  no Auth user or profile for the attempted admin email. No recipient details or
  credentials are included in this review artifact.
- The screenshot also shows `platform-pricing` 503 responses. Pricing uses its
  own server configuration/provider path; creation does not call it. Its live
  cause is unverified and is not repaired by changing the invitation allowlist.

## Prepared production correction

`supabase/migrations/pending/20261024014838_official_invitation_origin.sql`
inserts only the exact HTTPS canonical origin with `tenant_id = null`. It is
idempotent and retains the Netlify origin and authority-specific entries. No
wildcards, public grants, policy changes or identity changes are proposed.

The active migration manifest is unchanged. This file has **not been applied**.
Do not replay pending or historical migrations to make this correction.

Before release, use the protected adoption/release workflow, verify recovery
evidence, reconcile the current hosted schema/configuration, and obtain human
review. Inspect the installed `allowed_redirect_origins` triggers again before
the bounded rollback rehearsal. The observed triggers were
`safebus_private.enforce_sensitive_admin_mutation` and
`safebus_private.capture_sensitive_admin_audit`; both return immediately when
`auth.uid()` is null, and neither calls an email or external provider. Do not
disable these triggers or change security roles to perform the release.

Within the approved rehearsal transaction, set local statement and lock timeouts,
run only the reviewed insert, assert the exact origin is allowed and all prior
entries are preserved, and finish with ROLLBACK. No hosted write rehearsal has
been run as part of this review.

After the approved persistent release, verify with a read-only transaction:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SELECT origin, tenant_id IS NULL AS platform_wide
FROM public.allowed_redirect_origins
WHERE origin IN ('https://safebus.kids', 'https://bussafe.netlify.app');
SELECT public.is_allowed_redirect_origin('https://safebus.kids');
ROLLBACK;
```

Confirm the deployed invitation redirect and Supabase Auth callback settings
agree with that exact origin. Deploy the reviewed UI/error-handling change only
through the normal release process. The actual admin invitation and activation
still need an owner-authorized acceptance run; automated checks use mocked
providers and in-memory PostgreSQL and send no email.

## Validation

- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` passed.
  The test run included 551 web, 2 mobile, and 364 release checks.
- All seven onboarding browser scenarios passed across desktop and mobile.
  The longer edit/error/retry journey initially exceeded the default 30-second
  test timeout under concurrent checks; it now has a scoped 60-second budget
  for its two accessibility scans and three screenshots. Both viewport reruns
  passed (about 24 seconds each), with zero WCAG A/AA axe violations.
- The server suite passed all 33 checks, including blocked/failed origin checks
  and malformed URLs stopping before email/account changes. Safe reason codes
  are logged without recording the configured URL or provider error details.
- The prepared insert passed a local in-memory PostgreSQL test using the actual
  allowlist table constraints, including replay and preservation of existing rows.
- Production verification used only bounded read-only transactions with local
  timeouts and ROLLBACK. No production data/configuration changes, invitations,
  notifications, deployment, or merge were performed.
