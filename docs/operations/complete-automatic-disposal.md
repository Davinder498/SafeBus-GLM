# Complete application disposal — SafeBus

November 5, 2026. PRs #387 and #388 are merged. A fresh read-only BusSafe query
found no `run_retention_lifecycle` endpoint and found destructive execution off.
This forward release preserves that state during installation. It does not install
or activate either migration by itself.

## What runs automatically after activation

| Class                                                                                  | Trigger, period and method                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GPS, trip events, exception/status records, resolved announcements, inbox and delivery | Retain the reviewed 30/395/90-day lifecycle from #388, including separate receipt and terminal delivery clocks. Pending deliveries and unresolved announcements remain. Scoped GPS archives require verified encrypted read-back.                                                                                                                         |
| Invitations                                                                            | Delete after 90 days from terminal/expiry and relevant send/update times; pending or in-process delivery blocks disposal.                                                                                                                                                                                                                                 |
| Student transport record                                                               | Delete after 395 days of inactive, transferred or archived status measured from last update, once independent dependent records have expired. Subordinate assignment/QR setup follows the inactive student; preserved trip events, inbox and guardian links block early cascade.                                                                          |
| Guardian link                                                                          | Delete after 395 days of inactivity, including links of a student already inactive for that period. Both record and parent preservation apply.                                                                                                                                                                                                            |
| Driver and guardian directory                                                          | Remove inactive identity after 395 days and after independently retained operational links clear. Minimize the associated recipient profile and disable access; preserve required history first. Driver assignments and tracking-device setup are subordinate to that inactive driver.                                                                    |
| Recipient Auth account                                                                 | Remove only a disabled driver or guardian after 395 days and applicable extensions/holds, once independently retained dependencies and Storage ownership clear. Remove through Supabase Auth Admin, then verify both Auth and profile absence. Administrators are outside this automatic removal rule.                                                    |
| Bus tracking session                                                                   | Delete ended/revoked sessions after 30 days from the latest expiry/end/activity clock. Trip holds can retain references.                                                                                                                                                                                                                                  |
| Dispatch and trip parents                                                              | Remove terminal records after 395 days; remove dispatches before their trip parent. Trips wait for live/late/held children to clear. Trip-only current position and pre-trip setup follow the expired trip.                                                                                                                                               |
| Audit events                                                                           | After 730 days, remove actor/tenant/network, target and detail fields; retain action, outcome and time. This is minimization, not proof that remaining data is anonymous. A breach case is a different record.                                                                                                                                            |
| Rate counters and session mirrors                                                      | Remove counters after two days; remove mirrors after 90 days from last activity/revocation only once the matching Auth session is absent.                                                                                                                                                                                                                 |
| Failed notification fan-out and stale push registrations                               | Remove terminal fan-out failures after 90 days. Remove registrations unused for 90 days only after dependent push rows clear. Preserve pending work and account holds; no claim of provider-side FCM erasure.                                                                                                                                             |
| Disposal evidence and released holds                                                   | Bounded cleanup after 395 days. Aggregate execution counts commit with their mutations; Auth removal has separately confirmed completion.                                                                                                                                                                                                                 |
| Android encrypted GPS queue                                                            | Remove expired FIFO samples after 30 days from both recording and device receipt on queue access, up to 64 at a time. Version 1 rows retain their data during upgrade and get one shared conservative receipt timestamp at upgrade. A powered-off or unused device cannot be remotely erased. Signed upgrade/physical-device acceptance remains required. |

The owner-approved periods are defaults. Keep decision, dispute, access request,
incident and other legally required records scoped. Decision use can extend a
minimum to one calendar year in Alberta time; longer instructions still apply.
Use an internal reference rather than names or an incident narrative. A review
does not release preservation; an authorized administrator must confirm release
once the minimum has passed. A school authority can extend, but cannot shorten,
its supported class periods. Longer GPS needs go through the scoped trip workflow.

The new worker processes at most 500 rows per class and four batches per invocation,
with a database lock timeout and one Auth operation per invocation. Repeated runs
converge. New FK dependencies block parent disposal rather than being silently
cascaded. Account reservations prevent reactivation and new application references;
if a provider request completes but its reply is lost, the next invocation
verifies absence and records completion once. Storage ownership and unfamiliar
references block the request rather than triggering unrelated deletion.

## Role acceptance

| Role                           | Acceptance                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| School authority admin         | Open Records disposal from Settings. Review authority totals, choose and export permitted source records, request/review/release preservation, and extend supported defaults. Recent sign-in and MFA for sensitive operations. |
| Transportation admin           | Same authority, operational record classes only. No access to student/guardian directory, invitations, driver identity exports or account controls. Existing trip GPS archive behavior remains.                                |
| Platform admin                 | View and download aggregate counts only. No customer record search, download, preservation mutation or live deletion button.                                                                                                   |
| School admin, guardian, driver | No disposal access. Existing trip or linked-student roles and notification choices remain.                                                                                                                                     |
| Scheduled worker               | Bounded server-only disposal/verified archive work. No anonymous, browser or cross-authority execution. Existing operational alerts are sanitized and deduplicated.                                                            |

Production's audit CHECK constraint does not accept the literal `retention.create`,
`retention.review` or `retention.archive_access` actions prepared in #388. The
forward release keeps the approved audit vocabulary (`security.config_changed`
and `data.exported`) with an operation field. The database fixture reproduces
that constraint and checks the actual trip preservation path. Install both
stages before attempting hosted UI acceptance.

## Protected rollout

1. Review and merge the complete disposal PR. Review the exact main SHA and
   confirm no customer classification/hold is missing. The author does not merge.
2. Run **Release operational fix** for `retention_lifecycle` in `rehearse` mode,
   then protected `install`. Keep the database master and Netlify execution flag off.
3. Repeat for `complete_disposal` on the same reviewed SHA. The manifest verifies
   installed function fingerprints, grants, private tables, triggers and indexes;
   it captures encrypted bounded recovery and rehearses restoration. The verify
   step evaluates all 23 database classes with a literal dry-run inside a
   read-only transaction. After real disposal, schema rollback cannot restore
   removed data and refuses to discard retained evidence.
4. Configure the private archive key and secure recovery custody described in
   [the lifecycle acceptance record](retention-lifecycle-acceptance.md). Verify
   authorized scoped read-back, no cross-authority access, scheduled dry runs,
   signed Android queue upgrade and data-volume/lock behavior. Adopt installed
   RPCs into the active inventory only after catalog verification.
5. Activate the database approval reference and server execution flag through the
   reviewed production change. Verify the first bounded run, counts, archive
   results, Auth completion and scheduler cadence. No automatic activation occurs
   on merge, migration installation, or customer onboarding.

To pause, switch off server execution and the database control through the
protected process. An already submitted provider request may complete. Do not revive a legacy unscoped runner. Keep existing holds and
archives. Restore to quarantine first and reconcile recorded deletes/revocations
before serving restored data. A successful dry-run is not deletion evidence.

## Disposal outside the application

Database deletion does not delete the district's exported copies or separately
held supplier data. Verify the actual retention setting and evidence per supplier:

- Zoho prospect and ordinary support correspondence: classify first; use the
  selected 90 days after resolution / 365 days after closure for ordinary items,
  excluding open requests, disputes, breach files and tax-supporting records.
  No mailbox access or automated deletion connector is configured by this PR.
- Contracts, tax records, personnel and privacy/breach files: maintain their
  controlling schedules and holds in the system of record. No inferred calendar
  rule deletes Stripe invoices or legal records.
- Supabase backups, Netlify/Resend/FCM and other provider logs: apply verified
  provider windows and procedures. The app cannot selectively erase immutable
  backups or independently verify erasure from a provider's internal systems.
- GitHub encrypted recovery artifacts use explicit workflow retention windows.
  Those windows do not govern downloaded copies. Verify backup expiry separately
  and retain scoped recovery evidence under the accepted policy.

These remain operational/provider acceptance tasks; the platform page reports
application records only. Do not sign full disposal completion until evidence for
these separate stores exists.

## November 9 — district-controlled user experience; no change to destructive execution

The owner approved using existing self-service, scoped school-authority
record controls as the first option, rather than a mandatory blanket
30-day return/60-day deletion on cancellation. The tenant-admin Settings
page now points to directory CSV exports, supported record-level
management, preservation and a request path for account closure or
additional export. It does **not** expose a one-click tenant wipe, legal
archive export, direct cloud-backup erasure or new client-side deletion API.

**This business decision does not change this worker's separate protected
activation requirements.** Keep the database approval reference and
server-side destructive execution flag **off** until legally and technically
verified. Auth, tenant isolation, holds, provider backups, financial/security
record duties and customer-specific agreements remain independent.
