# Notification preferences and school authority announcements

This change separates personal notification preferences from school authority
communication. Administrators use `/admin/announcements` to send Operational
alerts to all guardians and drivers, guardians only, or drivers only. The compose
form reviews the title, message, and current recipient count before sending.
History records sender, time, audience, and addressed recipient counts. These
counts do not assert successful email/push delivery or that a message was read.

## Categories and personal choices

| Recipient                      | Preferences and inbox filters                       |
| ------------------------------ | --------------------------------------------------- |
| Guardian                       | Pickup & drop-off, Trip updates, Operational alerts |
| Driver                         | Assignment alerts, Trip updates, Operational alerts |
| School authority administrator | Trip updates, Operational alerts, Delivery health   |

`operations` and `service_changes` remain distinct stored identifiers, sharing
the Operational alerts preference group and inbox filter. Historical rows are
not reclassified. The driver no longer has an assignment-only inbox restriction;
trip and disruption notices require the driver's own trip. New external channel
choices default off, preserving existing opt-outs. Existing quiet hours and
Android permissions continue to apply. Driver and administrator inbox visibility
is captured at insertion, like guardian visibility; changing preferences does
not rewrite history. Ordinary recipient preference changes require an active
session and enrolled MFA where applicable, without a recent-sign-in requirement.

Administrator notification preferences affect only their own inbox. They no
longer expose the authority-wide email/push delivery switches or provider health
diagnostics as personal settings. Existing policy RPCs remain for compatibility
and controlled operations; this change does not resume intentionally paused
authorities or change notification provisioning defaults from PR #308.

## Server boundary and delivery

- Tenant and transportation administrators address their own school authority.
  A school administrator addresses only guardians with active, unexpired links
  to active students in their school, and drivers with effective assignments to
  that school's active routes. A guardian with multiple linked students receives
  one announcement, not one copy per student.
- Count, send, and history RPCs derive scope from the active server-side profile,
  school, and authority, with an active session and required administrator MFA.
  The client cannot supply a tenant, school, recipient list, or sender identity.
- Announcement records live in `safebus_private` with RLS and no direct browser
  table privileges. Internal helpers have no PUBLIC/anon/authenticated execution
  grants. Authenticated-only public RPCs perform authorization internally.
- Title/message limits are 160/4,000 characters. Sending rechecks audience count,
  serializes per authority, and permits at most 20 broadcasts per rolling hour.
  Retrying the same send identifier/content returns the original result instead
  of sending again, including an uncertain response after a successful commit.
- Canonical inbox rows, durable email and push outboxes, existing quota/lease
  workers, recipient choices, and device permissions are reused. Announcements
  have informational severity; no urgent/quiet-hours override is introduced.
  Inbox/detail and external delivery recheck current recipient eligibility, so
  expired guardian links and ended school assignments revoke access/delivery.
- Email and lock-screen push use generic announcement copy and direct the
  recipient to SafeBus for the full message. Message bodies are not logged or
  added to notification invalidation payloads.
- Older driver clients keep assignment preference RPCs; saving through them
  leaves the new trip/operational selections unchanged.

## Database release

Prepared migration:
`supabase/migrations/pending/20261025002759_authority_announcements.sql`.
It starts with executable SQL, with no leading narrative to copy accidentally.
Do not replay old migrations. Before promotion, reconcile the target against the
reviewed hosted definitions and the prior launch settings migrations (including
`has_completed_optional_mfa()`); pending files are not evidence of deployment.
Use the protected release workflow with verified recovery evidence and human
review. Apply this migration before releasing the new web/native clients. It
does not remove the existing recipient RPC signatures.

The BusSafe hosted schema was inspected read-only. Enabled DDL event triggers
were reviewed: schema reload NOTIFY is transactional and extension-specific
hooks do not perform external delivery. The complete migration was rehearsed
with statement timeout 5 seconds, lock timeout 1 second, and final ROLLBACK.
RLS, authenticated RPC grants, anonymous denial, and direct-history denial passed.
A separate read-only transaction confirmed the new table/RPC did not persist.
No real announcements, external notification tests, identity changes, or fixture
writes were performed on the hosted project. Functional fixtures run only in
embedded PostgreSQL (PGlite).

The hosted security advisor was read after rollback. Its existing release-schema
RLS/no-policy notices, authenticated SECURITY DEFINER endpoint notices, and leaked
password protection notice predate this change. The new objects are not deployed;
run advisors again after the approved release. Supabase guidance:
[function security](https://supabase.com/docs/guides/database/functions),
[row security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Validation

- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` pass (581 web
  tests, 2 mobile tests, 364 release checks).
- Migration verification passes for all 125 immutable tracked files. The new
  forward migration remains pending.
- Fourteen desktop/phone browser checks pass for personal preferences across all
  three administrator roles, audience selection, preview-before-send, history,
  retry idempotency, empty audiences, and the existing compact inbox. The new
  screens pass the included WCAG A/AA checks and desktop/phone visual inspection.
- Native guardian/driver inbox checks pass; driver settings includes all three
  categories in the in-app, email, and push cards.
- Embedded PostgreSQL verifies scope, MFA/session rejection, sibling deduplication,
  recipient opt-outs, generic outbox creation, guardian link and school-driver
  assignment revocation before delivery, and malformed preference rejection.

These checks establish implemented and tested behavior, not production release
or real-provider delivery verification for the new announcement event.
