# SafeBus launch closure — reconciled November 11, 2026

Baseline: main `f384d2675b8cbfe4d3874b9eaf6f1f53808ad7dc` (PR 440).
This is the current execution checklist, superseding stale status statements in
the November 9 review without deleting its historical evidence. Commercial launch
remains unapproved. Target: 5,000–10,000 buses; peak simultaneous guardians and
measured capacity remain unspecified/unverified.

## Original findings and current disposition

| Finding                        | Current evidence and disposition                                                                                                                                                                                                                                                                                                                   | Required closure                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Tracking fan-out            | **Installed; housekeeping repair pending.** Protected installation 43081399229 passed. Independent live negative-privilege acceptance passed; dispatcher job is active and 118 sampled executions succeeded. The queue was empty. Housekeeping timed out; see the repair checkpoint below.                                                         | Protected rehearsal, recovery, installation and read-only acceptance; then measure queue age, fan-out and GPS-write latency. A 250-message/second worker is not fleet qualification.                                              |
| 2. Retention                   | **Partly superseded, partly open.** GPS history is absent and location-expiry cron is active. The old GPS-history accumulation calculation no longer applies. Operational retention still reports `destructive_enabled=false`, with no approval time.                                                                                              | Qualify holds, expiry, recovery and operational-record throughput before separately approved destructive activation. Do not recreate GPS history.                                                                                 |
| 3. Release controls            | **Production publishing verified.** Release 42957090161 required an eligible reviewer, passed exact-main checks, published PR 440 and verified 152 files with zero retries. Netlify cloud builds stayed stopped. Owner now authorizes the engineer to merge passing PRs; the old requirement that the owner manually merge every PR is superseded. | Preserve actual GitHub production approval protection and required checks. No new approval-policy weakening is included.                                                                                                          |
| 4. Preview credentials         | **Containment verified in the successful release.** Production-context credential isolation and stopped cloud builds were checked before and after publication; prior previews were handled by PR 430.                                                                                                                                             | Keep these controls. Historical exposure/recovery-custody review is distinct from current configuration; do not claim evidence of a breach or automatically rotate credentials.                                                   |
| 5. Guardian stale home         | **Code released; automated regression passed.** PR 431 is included in the PR 440 production artifact. Home uses bounded refresh, cancellation and fail-closed recovery.                                                                                                                                                                            | Complete a controlled signed-in live journey and the deferred physical-device acceptance. Do not repeat the obsolete “not deployed” statement.                                                                                    |
| 6. Application paging          | **Open; current provider mode not reread in this audit.** Earlier provider observation was observe-only. Source supports an alert mode; operations evidence remains incomplete.                                                                                                                                                                    | Verify current settings, activate the approved routing through protected configuration, and demonstrate operator receipt, deduplication and recovery.                                                                             |
| 7. Billing risks               | **Open, source-confirmed.** Current webhook supported-events list omits refund, dispute and early-fraud-warning events.                                                                                                                                                                                                                            | Signed/idempotent ingestion, canonical authority mapping, restricted incident review and sandbox replay; then update provider subscriptions. Keep bus service active as already approved.                                         |
| 8. Recipient distribution      | **Open/deferred.** Current app copy requires Android testing access; iOS remains unavailable.                                                                                                                                                                                                                                                      | Verify production Android availability and eligible-recipient installation. The owner resumed iOS on November 11; cloud builds must support the owner’s Windows-only setup. Do not claim iPhone support before device acceptance. |
| 9. Large selectors             | **Open, source-confirmed.** Guardian lookup is unpaginated; driver-profile lookup still limits results to 250.                                                                                                                                                                                                                                     | Scoped complete/searchable selectors with stable labels, low-cap and beyond-250 regression coverage; avoid downloading unnecessary personal details.                                                                              |
| 10. Password protection        | **Open, live-confirmed.** November 11 Supabase security advisor still reports leaked-password protection disabled.                                                                                                                                                                                                                                 | Use the protected Auth-setting release, verify the setting and authentication/recovery behaviour; do not purchase a plan without an actual approved expense.                                                                      |
| 11. Older notification default | **Open, live-confirmed in aggregate.** Two policies approved; one pending with no approval time. No recipient identities were retrieved.                                                                                                                                                                                                           | Inspect the existing account audit history, then exact-before-state repair if it is the legacy default. Preserve deliberate rejection and personal preferences; no QA sends.                                                      |
| 12. Live service and scale     | **Unverified.** CI and public-file verification do not supply signed-in end-to-end, provider receipt, physical-phone or realistic fleet evidence.                                                                                                                                                                                                  | Controlled source-event/role acceptance, Windows/Linux input integrity, recovery exercise and approved isolated load qualification. No load testing of the sole production database.                                              |
| 13. Guardian map branding      | **Open, source-confirmed.** Native map header still lacks the existing text wordmark.                                                                                                                                                                                                                                                              | Small responsive header repair using the current brand component; preserve back/refresh controls and map space.                                                                                                                   |

## Decisions already made — do not ask again

`config/commercial-launch-closure.json` records November 10 owner directions:

- Keep Netlify Free, stop cloud builds and use protected external builds; no paid upgrade authorized.
- Refunds, disputes and fraud warnings require manual billing review. Keep bus service active; no automatic suspension.
- Operations mailbox is `info@safebus.kids`; owner is primary responder, school-day coverage 06:00–18:00 America/Edmonton with 30-minute trip extension and 15-minute urgent acknowledgement. Backup responder and customer publication evidence remain unresolved. Reconcile older contract/support wording before making customer promises.
- iOS was resumed on November 11 and is the main product priority. The owner has no MacBook. Close tracking housekeeping and deployment-record reconciliation first, then the cloud-build foundation and real-iPhone acceptance. No physical testing is complete.
- Fleet target is 5,000–10,000 buses. The approved prices, trial, renewal/cancellation, liability and indemnification decisions remain in force; this audit reopens none of them.
- Owner has authorized agent-managed PR fixes and merges. Existing service access boundaries and protected production review remain.

## Verification performed for this reconciliation

- Confirmed GitHub main remains the published PR 440 merge SHA.
- Read current source and the original thirteen findings against subsequent PR evidence.
- Queried only the authorized BusSafe production project (`ckrkfylsyihwouvesypm`), using explicit read-only transactions, five-second statement limits, one-second lock limits and rollback. No fixture writes, customer-row export, notifications, charges or production configuration changes.
- Live cron inventory: notification dispatcher and tracking-position expiry only. Queue absence and synchronous producer body were separately inspected.
- Security advisors: 22 private/release tables with RLS and no ordinary policies; 162 authenticated SECURITY DEFINER review notices; one disabled-password-protection notice. The first two groups are not automatically vulnerabilities and must not be “fixed” by widening table access or removing required RPCs.
- Performance advisors: 49 unindexed foreign keys, 9 RLS initplan notices, 24 multiple-policy notices and 157 unused-index notices. Triage using actual workload/query plans; do not blindly drop indexes on a small prelaunch dataset. Health advisor: no findings.

Advisor references: [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [private RLS policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [privileged RPC review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Execution order and acceptance boundaries

1. Release the already-prepared tracking change through rehearsal/recovery/install, and verify Auth password protection through its existing protected workflow. Keep capacity claims open.
2. Consolidate remaining source fixes: selectors, map branding, billing-risk handling and monitoring gaps. Review and test together before opening a PR; choose browser coverage from the affected runtime paths.
3. Reconcile provider configuration and the exact legacy notification default. Retain before/after evidence and recovery; do not send real recipient tests or exercise real billing as QA.
4. Complete controlled signed-in school-authority/transportation-admin/driver/guardian/platform journeys and source-event delivery. The retired school-admin role remains denied; individual schools are metadata, not customer accounts.
5. Complete explicitly deferred physical/distribution work when resumed; qualify actual capacity with an approved isolated target and budget. Approve pilot scope only against completed evidence.

Completion requires working behaviour and recorded evidence, not changing a status
field. No new PR, release, provider setting, readiness approval or paid resource is
created merely by this reconciliation.

## Execution checkpoint

- Local typecheck, lint, web build, test suite (590 passed), mobile build and Android sync passed on November 11. Generated mobile artwork was reverted to the tracked version to avoid unrelated build-output changes.
- Started protected tracking rehearsal [43057749176](https://github.com/Davinder498/SafeBus-GLM/actions/runs/43057749176) against the exact published main SHA. This is rehearsal only; dispatch is not evidence of successful rehearsal or installation.
- No new pull request or Netlify build was started for this reconciliation.

## Tracking installation and housekeeping repair checkpoint

- Rehearsal [43057749176](https://github.com/Davinder498/SafeBus-GLM/actions/runs/43057749176) passed, restored the before-state, and retained encrypted recovery.
- Installation [43081399229](https://github.com/Davinder498/SafeBus-GLM/actions/runs/43081399229) passed preparation, recovery upload, migration and read-only acceptance. Recovery and outcome artifacts remain available on that run.
- Independent November 11 read-only acceptance passed. Both named jobs were active. A bounded sample of the most recent 200 cron runs contained 118 successful dispatcher runs and two failed housekeeping runs. The queue was empty at observation; this is not delivery or fleet-load qualification.
- Housekeeping fails at its 750ms statement limit while searching shared cron history. The table has only a run-ID index, an estimated 101,715 rows and approximately 196 MB of table storage. The old join can scan unrelated history even when no tracking rows are old enough to delete.
- Prepared a forward repair (`tracking_history` operational milestone) with a `(jobid, end_time, runid)` index and bounded indexed lookups per named job. It preserves the combined 1,000-row deletion cap, 48-hour cutoff, unfinished/unrelated history, private ACLs and existing job schedules/timeouts. No customer data is targeted.
- The protected rehearsal must prove index creation fits the existing 5-second statement/1-second lock bounds. If it does not, stop and design a separately reviewed concurrent index rollout; do not raise limits or retry blindly. Installation captures fresh encrypted recovery and verifies the exact index, function, schedules and private access. Recovery restores the original function and drops only the added index.
- All affected application roles retain existing permissions and behaviour: school-authority/transportation/platform admins, guardians and drivers gain no access to internal jobs; retired school-admin remains denied. No frontend changes are included. The current CI classifier nevertheless requires full browser smoke coverage for workflow and migration changes; do not promise that this PR will skip it. Local fixtures cover mixed unrelated history, no eligible rows, the shared deletion cap, indexed query planning, ACL preservation and recovery. Live repeated-job success is still required after the repair.

- Before opening the consolidated repair PR, reconcile the observed schema release record with the reviewed operational rollout. The operational installer changes catalog objects but does not update `safebus_release.releases.schema_fingerprint`; drift checks must retain exact verification rather than accepting an arbitrary current fingerprint. The installed queue also needs the exact private-table audit entry; that entry is prepared with the same owner/RLS/no-policy/no-client-grant checks, without broadening access.

- Repair validation: typecheck, lint, web build, 592 release tests, mobile build and Android sync passed. The focused authorization test also passed after adding the exact queue audit entry. Repair remains prepared, not merged or installed; release-record reconciliation is still outstanding.

## Deployment-record reconciliation and agreement verification

The operational tracking installer did not register the changed schema in the
release ledger. The repair now verifies a narrowly defined inverse catalog delta
in memory, reconstructing the exact last registered schema before allowing an
atomic repair-and-ledger commit. It does not reset the expected fingerprint or
change production objects merely to inspect them. Unknown grants, indexes,
policies, function changes and unrelated schema changes remain visible and fail.

November 11 read-only proof reproduces the stored fingerprint
`17933029e03585ebec3918cd1c7ac7d53ecfdc994dfbc2db254c57f4a8951592`
for release `ba80cbe5671d41dc09671828cf6a0b132d526b88`. Original producer
text was recovered from the metadata-only catalog in recovery run 42731612439,
artifact 13739357850. Its body retains CRLF; normalizing this text would falsely
fail the full fingerprint even though the operational MD5 normalizes CRLF.
The committed delta models hosted PostgreSQL 17; fixture PostgreSQL 18 adds
standalone NOT NULL constraint rows, excluded only in the fixture adapter.
Protected rehearsal must repeat this proof in one consistent transaction.
Recovery includes a guarded removal of only this repair’s ledger entry and
refuses a later/different deployment. It restores the original pre-repair state,
including its outstanding ledger discrepancy; it is not launch readiness.

Live agreement check: the district catalog has **zero published revisions**,
**zero packages**, and **zero executed receipts**. Stored document versions
contain only participant acceptable-use terms 2026.1 (November 8). Neither an
MSA nor a DPA is published. Repository MSA/DPA documents are still drafts with
unfilled customer/authority and assistance terms and unresolved supplier facts.
The eight-document review/acceptance/receipt workflow is implemented, but that
is not evidence of a published contract or customer acceptance. SafeBus calls
its data agreement the DPA; no separate DSA has been verified. Do not remove draft
markers or invent supplier approval to make publication pass.

Final repair validation: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and
`pnpm test` passed, including all 595 release tests with the new lineage suite
wired into the root command. The explicit mobile build and Android `cap:sync`
also passed. Generated artwork was restored to avoid unrelated binary changes.
CI, protected rehearsal, installation and live housekeeping acceptance remain
separate requirements; no live repair or iPhone build is claimed by these results.
