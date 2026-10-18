# Trip updates, expandable cards and email worker

## Observed production diagnosis — October 18, 2026

Bounded, rollback-only read checks found two guardian trip-start rows for the
same trip and recipient, each with a different linked student. The audience
function's deduplication key included the student, producing duplicate trip copy.

Both corresponding email rows were eligible and pending with zero attempts.
The tenant email/privacy approval and guardian trip-email choices were enabled.
Read-only Netlify metadata confirmed production Functions have the provider,
sender and Supabase settings. The manual dispatcher secret was absent. The
scheduled function incorrectly required that unrelated secret before claiming
any work. Credentials, recipient addresses and message bodies were not logged,
and no production notification or test email was sent. Provider acceptance and
recipient inbox delivery still require observation after approved release.

## Changes

- Guardian and driver update cards are clickable. Short messages mark read
  without opening another copy. Messages longer than three rendered lines
  expand/collapse inline with keyboard support and `aria-expanded`. Archiving
  remains separate. Existing authorized deep links remain supported.
- Driver menus now contain one **Privacy Notice** action. Account deletion
  remains reachable through the notice.
- The Netlify scheduled entry point calls the shared queue drain without
  requiring the manual HTTP secret. The HTTP handler still fails closed without
  its secret and cannot opt into scheduled execution via request fields.
  [Netlify's scheduled-function boundary](https://docs.netlify.com/build/functions/scheduled-functions/)
  prevents direct URL invocation; retain the schedule in `netlify.toml`.
- The pending migration emits one trip-wide notification per guardian/source
  event. Pickup and drop-off events remain per child. A new private predicate
  checks any currently linked, eligible child on that exact bus, route, trip
  pattern and service date. Inbox, push enqueue/claim/resolve and email resolution
  recheck that scope. Push still requires an eligible child's channel choice;
  tenant and recipient master switches, privacy approval and device gates remain.
- The email eligibility gate selects one eligible legacy queued email for the
  same guardian/source event, avoiding two emails when the repaired worker drains
  the old queue. Previously delivered emails suppress the redundant pending row.
  No notification history is deleted or rewritten by this migration.
- The worker uses a service-only versioned claim RPC installed by this migration.
  An application deployment before the schema release fails closed and cannot
  begin draining the old queue. Existing claim signatures remain compatible.

## Validation and protected release

Run the four required pnpm checks and focused mobile/worker tests. Embedded
PostgreSQL tests execute the actual forward functions, including sibling
deduplication, child-specific events, independent push consent, revocation after
claim, exact service/date/tenant checks, legacy queued email deduplication and
denied authenticated calls to internal/service-only functions. No hosted QA
fixtures or notifications are used.

Leave the migration under `supabase/migrations/pending`. Before release reconcile
the hosted function bodies and privileges against 0092/0110/0111/0120 and the
existing security reconciliation. Verify recovery evidence and rehearse in a
bounded rollback-only transaction through the protected workflow. Apply the SQL
before deploying the repaired email worker so existing queued sibling emails
are grouped before sending. Do not replay migration history or bypass approvals.
Promote the service-only entry in `config/pending/trip-notification-authorization.json`
with the reviewed release and regenerate hosted types after adoption; the current
type overlay is forward-only. Verify the authorization inventory after release.

After human review and protected release, observe the next normal scheduled run
(configured every five minutes): eligible queue rows should be attempted, the
redundant legacy row cancelled by the normal claim path, and one provider message
accepted. Confirm Delivered/recipient receipt separately; a successful local
mock or provider acceptance alone does not prove inbox delivery. Do not invoke
the production worker as QA or send an additional test email without explicit
recipient authorization. Historical duplicate inbox cards can remain until
archived; future trip events produce one card.
