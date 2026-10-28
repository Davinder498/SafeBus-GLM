# Active trip visibility and Alberta service dates

Target: the existing production-designated BusSafe project. This is a prepared
change, not a persistent deployment. Human merge review and the protected
production environment remain required.

The overview shows paginated active and paused runs above dated trip search.
Ongoing runs use all service dates and require no GPS record. Private tracking
signals, a fifteen-second visible/online fallback, focus and reconnect refresh
the authorized queries. GPS signals are limited to one automatic check per five
seconds. Failed background refresh retains a clearly labelled last-checked list.
Today rolls over in Alberta time; an applied historical/all-date filter remains.

## Hosted reconciliation and bounded change

`config/pending/admin-active-trip-visibility.json` binds the exact SQL digest,
twenty-nine function definition hashes and ACLs, one assigned-driver policy,
four operational date defaults and one confirmed trip-date repair. The reviewed
SQL is `supabase/migrations/pending/20261028065508_alberta_service_dates.sql`.

Twenty-eight existing functions replace only the `CURRENT_DATE` token with
`(now() AT TIME ZONE 'America/Edmonton')::date`, including defaults in function
arguments. This covers trip creation, dispatch preparation, assignment changes,
driver eligibility, linked guardian visibility and capacity-date checks.
The same date expression replaces the four column defaults and the existing
assigned-driver policy's date predicates. Policy audience, account ownership,
tenant/school restrictions, function owners, ACLs, session and MFA checks remain.
The search function adds the bounded combined `ongoing` status and retains
security-invoker execution and every existing tenant-safe join.

The repair identifies one existing run by its exact ID, tenant, original start
timestamp and erroneous date. It changes only the service date. It does not sweep
history, change status, start a trip or replay notifications. Review found that
the status notification trigger fires only on INSERT/UPDATE OF status; this
repair instead fires the updated-at and tracking invalidation triggers. The
tracking sender inserts transactionally into Realtime messages without external
HTTP calls. Those writes roll back during rehearsal.

The hosted rollback rehearsal compiled with body checking enabled, exposed the
one ongoing trip under an existing active administrator's transaction-local
authenticated identity, corrected its date inside the transaction, and left
notification/email/push queue counts unchanged. A separate read-only transaction
confirmed all twenty-nine original definitions, the policy, all four defaults and
the original trip date were restored. See the adjacent QA JSON evidence. No
persistent installation, browser release or phone receipt is implied. Hosted
school-scoped and transportation administrator samples are unavailable; embedded
PostgreSQL supplies those role cases.

## Protected installation and recovery

After reviewed merge, run **Release operational fix** on the exact current main
SHA, milestone `overview`, mode `rehearse`, confirmation
`REHEARSE_OPERATIONAL_FIX`. Then run mode `install`, confirmation
`INSTALL_OPERATIONAL_FIX`, through the same production protection.

The workflow validates the reviewed SHA, uses verified TLS and the shared schema
deployment lock, rejects baseline drift, and rehearses with rollback. It captures
encrypted bounded recovery and uploads it before persistent changes. Installation
rechecks the commit/run/project/SQL binding, recovery checksum, one-hour freshness,
exact snapshot, permissions and unchanged recipient data, then commits atomically.
An already installed state is verified without replay or a claim of pre-change
recovery. Partial adoption and unexpected permissions fail closed.

Use the encrypted snapshot's `restoreSql` through the protected production
workflow if recovery is needed. It restores exact function definitions, policy
expressions and defaults. The guarded date recovery restores only the confirmed
trip's date, preserving its current operational status and other fields. This is
bounded recovery, not a full database backup. Release/restore the matching web
artifact separately; retain live read-only verification after installation.

## Acceptance

- Embedded PostgreSQL: real QR-start and preparation paths at Alberta midnight
  and both DST transitions; driver assignment/route/bus eligibility; guardian
  linked-student stops; all administrator scopes; ongoing pagination; rejected
  guardian/driver/platform-admin search; exact rollback and unchanged ACLs.
- Browser: overnight active/paused runs, no GPS dependency, independent history
  filters, polling/focus/reconnect, midnight rollover, failed refresh, shrinking
  pages, compatibility with the earlier search RPC, desktop/phone accessibility.
- MFA remains required for all administrator roles. Guardian and driver
  enrollment remains optional, with enforcement after enrollment.

The client compatibility path uses the authenticated Data API and caller RLS
when the old search RPC rejects the combined status. It does not use a service
role or the legacy truncated overview function.
