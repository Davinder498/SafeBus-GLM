# SafeBus Retention and Disposal Schedule — Draft

**Status:** Proposed periods; legal/purpose approval and safe enforcement pending
**Owner:** Business Privacy Lead with Customer / Engineering / Operations
**Last updated:** 2026-11-05

**Fresh observation, 2026-11-05:** The column-reference correction is installed.
All twelve latest recorded policy runs completed successfully in dry-run mode
at 00:01:11.830928 UTC on November 5. The destructive control remains false, with
no approval reference. The earlier October observation below is historical and
must not be used to report the correction as uninstalled. See the
[read-only observation](retention-observation-2026-11-05.json).

The inspected retention entry points contain no scoped legal-hold exclusion.
Destructive execution remains blocked pending an accepted schedule, safe hold/
dependency handling, supplier windows and protected rollout. This work does not
enable deletion or alter periods. The server runner now rejects incomplete or
inconsistent results instead of reporting an empty response as successful.

## Purpose and acceptance boundary

This schedule supplies proposed business/transport periods for review. It does
not close R-011, establish legal retention periods or enable destructive deletion.
Approve each purpose, trigger, applicable minimum/maximum legal requirement,
hold exception, supplier/backup window and disposal method before execution.
A request/decision record can require different retention from routine raw GPS;
do not apply a generic ceiling to records subject to a lawful preservation duty.

The existing migration 0069 and daily scheduler prepare retention controls.
Destructive execution remains disabled until the approved, protected workflow,
reviewed execution-control change and server-only flag are completed. Applied
migrations are immutable. No database/flag change occurs in this drafting work.

## Proposed transport and security periods

| Data class / existing retention key                     | Draft period and trigger                                             | Prepared method / validation still needed                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invitations / `invitations`                             | 90 days after consumed/expired                                       | Delete; check supplier email copies separately                                                                                                            |
| Inactive student transport records / `student_records`  | 395 days (approximately 13 months) after inactivity                  | Delete dependent transport links/events in reviewed order; legal/request holds may prevent expiry                                                         |
| Guardian links / `guardian_relationships`               | 395 days (approximately 13 months) after inactivity                  | Link deletion is separate from loss of live authority and account closure                                                                                 |
| Driver operational identity / `driver_records`          | 395 days (approximately 13 months) after inactivity                  | Anonymize permitted operational identity; Auth account deletion separately reviewed                                                                       |
| Ended/revoked bus credentials / `bus_tracking_sessions` | 30 days after applicable expiry/end                                  | Delete stored hashed session records; secret/token revocation separately verified                                                                         |
| Completed dispatch / `bus_run_dispatches`               | 395 days (approximately 13 months) after completion/cancellation     | Delete before parent trip where required                                                                                                                  |
| Completed/cancelled trip / `trip_records`               | 395 days (approximately 13 months) after end                         | Delete dependencies; preserve scoped legal/records exceptions                                                                                             |
| Raw bus location / `raw_location_history`               | 30 days from relevant event timestamp                                | Delete after approved purpose/hold assessment; no downsampling/partitioning job is proved by this draft                                                   |
| Terminal email delivery / `notifications`               | 90 days after terminal state                                         | Delete; confirm provider queue/log retention                                                                                                              |
| Audit records / `audit_records`                         | 730 days (approximately 24 months) from event                        | Remove identifying fields where allowed; assess whether residual action/time data remain identifying                                                      |
| Abuse counters / `rate_limit_buckets`                   | 2 days from relevant window                                          | Delete scoped expired counters                                                                                                                            |
| Revoked/stale mirror / `user_sessions`                  | 90 days under approved trigger                                       | Delete mirror records; not equivalent to revoking real Auth sessions                                                                                      |
| In-app inbox/optional push records                      | Proposed 90-day periods in current inventory                         | Confirm current notification retention coverage and triggers; recipient-opt-in FCM is in current scope                                                    |
| Android offline queue / local secrets                   | Only while needed for authorized delivery/recovery and account state | Encrypted native storage; exact purge, expiry, uninstall and remote-revocation behavior must be tested, not inferred from the 18-hour authorization bound |

Migration keys/branches are implementation references, not a claim that all
proposed classes, new fields or holds are already covered. Validate relationships,
FK effects, policy exclusions, audit minimization and concurrent writes before
any fixture or destructive execution.

## Own-business and supplier records

| Class                                          | Proposed business position                                               | Decision/evidence needed                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Prospective-customer inquiry                   | Proposed disposal 90 days after resolution if no continuing relationship | Owner-mailbox and provider retention; purpose, consent/notice and lawful exception review                               |
| Support ticket/email                           | Proposed 12 months after resolution for ordinary support                 | Separate incident/hold needs; minimize copied student information and validate tooling disposal                         |
| Contracts, invoices and financial/tax records  | Retain under approved finance/legal schedule                             | Exact statutory/business periods, trigger, Stripe/accounting retention and identity minimization; no guessed tax period |
| Personnel/privacy training/appointment records | Retain while needed for accountability and applicable duties             | Employment/business schedule and access review                                                                          |
| Privacy requests, incidents and legal advice   | Scoped accountability/legal schedule                                     | Actual applicable periods, restricted access and hold reviews; not ordinary support cleanup                             |
| Supplier/CDN/function/API logs                 | Minimum necessary approved window per supplier                           | Actual provider settings, IP/metadata content, countries, agreements and deletion limits                                |
| Recovery exports and backups                   | `[BACKUP_RETENTION_WINDOW]` per approved system                          | Off-site copies, provider backups, GitHub transfer artifacts, key custody and verified expiry                           |

These own-business periods are proposals only. They are not existing SQL policy
keys and must not be sent to a deletion RPC that does not implement them.

## Holds, expiry and recovery

Use [legal-hold procedure](legal-hold-procedure.md) for a specific lawful reason.
Document scope and review date; do not disable deletion globally or preserve
all tenants indefinitely. Identify any current lack of a safe hold implementation
as an execution blocker, then prepare a separately reviewed solution.

Delete/anonymize through approved scoped mechanisms, record aggregate completion
and verify actual output. Primary deletion, account revocation, supplier disposal
and immutable backup expiry are different results. Apply the accepted backup
window and reapply verified deletion/revocation before restored data returns to
normal processing. No instant remote wipe or selective immutable-backup erasure
is promised.

## Final acceptance record

- [ ] Period/purpose/legal requirements and customer duties approved per class.
- [ ] Supplier and backup windows approved with working disposal evidence.
- [ ] Field/FK/trigger and hold behavior reviewed before approved test writes.
- [ ] Safe dry-run and enforcement tests completed on the explicitly approved
      target; preserve the production designation and applicable workflow guards.
- [ ] Device queue, Auth/device/session and restored-data behavior verified.
- [ ] Operator ownership, failure alerts, concurrency and aggregate evidence pass.
- [ ] Any necessary forward migration/execution flag follows separate review.

An approved PIA or signed contract does not itself execute retention. Record
actual results and non-secret evidence references only after they pass.

## Concrete business proposal awaiting decision

Retain the twelve configured SQL periods above as the proposed transport/security
baseline, with exact day counts rather than treating 395 days as 13 calendar
months. These are business proposals, not universal legal periods. The authority's
records obligations, preservation duties and applicable minimums take priority.

For own-business records, propose inquiry disposal 90 days after resolution when
no relationship continues, and ordinary support correspondence 365 days after
closure. A privacy request or incident is outside ordinary ticket cleanup:
record a restricted case-specific accountability/hold period before disposal.
For required tax records, use CRA's general six-year period measured from the
end of the last relevant tax year, with the applicable exceptions (including
late filing, objections, historical corporate records and directions to retain
longer). Do not automatically delete every contract or invoice at six years.
[CRA business record guidance](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/keeping-records/where-keep-your-records-long-request-permission-destroy-them-early.html).

Alberta guidance requires necessary business/legal retention and secure disposal;
it does not supply these proposed product periods.
[Alberta responsibilities](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information).

Before approval/activation, resolve these actual implementation differences:

- The general email policy uses terminal-event/update timestamps; the notification
  subsystem uses creation age plus terminal status. Recommend 90 days from the
  relevant terminal event for email/push, and 90 days from creation for inbox
  entries. Align the routines and test late delivery before enabling deletion.
- Student/trip deletion can cascade to dependent records. Scoped preservation
  must cover both direct deletion and parent cascades; a hold on one child row
  is insufficient if its parent can be deleted.
- Driver/audit anonymization is partial field removal, not proof that all residual
  fields or action/time records are non-identifying.
- Database primary deletion does not clear Zoho/Resend, Firebase installation
  identifiers, exports, device queues or immutable backups. Supplier-specific
  actions and expiry evidence remain separate.

Recommended recovery-copy policy for review: rolling 30-day owner-controlled
recovery copies, with restricted access, verified expiry and scoped legal holds.
This is not a claimed Supabase/Netlify backup setting. Provider copies follow
verified plan/service windows; no provider backup duration is invented here.

The owner must select/approve these business periods and supplier exceptions.
Approval of a period alone does not authorize enabling destructive execution;
safe hold/cascade behavior and protected technical acceptance must also pass.

The scheduled runner uses two RPC calls, and the batch can return individual
policy failures after earlier work completed. An HTTP failure does not establish
that completed database work was rolled back. Define bounded retry, partial-run
reconciliation and recovery before any destructive activation.
