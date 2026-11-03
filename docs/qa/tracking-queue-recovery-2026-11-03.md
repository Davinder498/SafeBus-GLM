# Tracking queue and session recovery

Acceptance recorded before implementation. Depends on the immediate local-stop
correction in PR #357. This milestone does not implement retention, driver dates,
directory loading, password UX, publication or iOS.

## Role acceptance

| Role                   | Allowed behavior                                                                                                                                    | Boundaries and failure behavior                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driver                 | Recover previously captured locations on the same registered installation after normal credential rotation, rescan, pause/end and a subsequent trip | Current driver/account/device authorization is always required. Check an older session's ownership without sending coordinates first. Preserve event IDs, sequence, recorded time and coordinates. Expired, explicitly revoked, foreign-driver, foreign-authority or foreign-device sessions cannot be recovered. Optional MFA remains optional; enrollment is enforced when present. |
| Guardian               | Existing linked-student bus visibility                                                                                                              | Old-session replies cannot stop the current collector or present historical delivery as fresh current-trip GPS. No raw history, cross-student data, recovery controls or new notification subscriptions.                                                                                                                                                                              |
| School authority admin | Existing scoped visibility and lost-phone revocation                                                                                                | Required MFA and authority boundaries remain. Device revocation must immediately reject later recovery requests and ingestion. No driver queue endpoint access.                                                                                                                                                                                                                       |
| School-scoped admin    | Existing assigned-school transportation visibility                                                                                                  | Required MFA, school scope and existing action permissions remain; no queue endpoint access.                                                                                                                                                                                                                                                                                          |
| Transportation admin   | Existing transportation visibility and authorized trip actions                                                                                      | Required MFA and authority boundaries remain; no driver queue endpoint access.                                                                                                                                                                                                                                                                                                        |
| Platform admin         | Existing platform operations                                                                                                                        | Required MFA remains; no driver queue endpoint access or new recipient/history visibility.                                                                                                                                                                                                                                                                                            |

Location recovery is not a new trip or notification source. No synthetic tests
may send real notifications or alter existing identities/operating trips. Source
events and recipient choices retain their existing server rules.

## Required recovery behavior

- Normal QR rescan retires the former session for bounded historical ingestion;
  explicit revocation remains revocation. A retired session cannot collect new
  locations after its retirement boundary or authorization expiry.
- Device credential rotation does not erase valid queued history. The current
  credential can authorize recovery only for the exact installation, driver and
  authority that owned the original session.
- A rejected retired event cannot halt a replacement session. A rejection of
  current authentication/device/session authorization still stops collection.
- Apply stop/pause responses only to the session that produced the event.
  Current delivery status cannot inherit an old session's acknowledgement.
- Preserve paced event/proof uploads, bounded token refresh, retry/backoff,
  duplicate-event handling, encrypted queue persistence and immediate local-stop
  behavior. A successful proof and its location upload use separate pump attempts.

## Verification and rollout

Inspect the actual hosted definitions and dependencies in a read-only transaction
with timeouts and rollback. Retain the observed definitions as a reconciliation
fixture. Keep forward SQL pending until human review. Use the protected operational
release workflow for reconciliation, rollback rehearsal, encrypted recovery,
installation and exact post-install verification. Do not replay migrations or
require a second database.

Embedded PostgreSQL tests must cover actual ingestion and authorization behavior,
rotation, rescan boundaries, duplicates, ownership, revoked/expired sessions and
rollback restoration. Native tests must cover the recovery decisions and pacing.
Run all required workspace checks, mobile build then Android sync, and native
tests/package/lint. Physical-device rural backlog, rescan/end/start, account
switch, revoked phone, process restart and signed-install tests remain separate
acceptance evidence; source and local fixtures do not prove live operation.

## Coordinated release order

1. Review and merge this milestone. Run **Release operational fix** against the
   exact reviewed current-main SHA with milestone `tracking` and mode `rehearse`.
   This verifies the hosted baseline and exercises both forward DDL and the
   recovery SQL inside rollback-only transactions. It retains encrypted recovery
   evidence through the existing protected workflow.
2. Use the same protected workflow with mode `install`, retaining fresh recovery
   before the transaction commits. Verify all ten function definitions/ACLs and
   confirm `authorize_driver_tracking_queue(text,text)` is available in the Data
   API. The migration only changes function definitions and grants, not records.
3. Refresh generated database types through the existing protected type-refresh
   workflow after installation. Review its generated change normally; do not
   represent the forward RPC as already present in the hosted generated types.
4. Build and field-test the reviewed signed Android candidate only after the
   server change is verified. The first event of each authorization must pass
   the coordinate-free protocol check. Missing/incompatible recovery service
   stops collection with an explicit platform-service error and preserves the
   remaining queue; it must be resolved before distribution, not left disabled.
5. A backend rollback restores definitions/ACLs, not operational history. It
   requires the retained recovery evidence and normal protected review. A new
   client encountering the old backend stops rather than exporting the queue.

Existing `revoked` sessions remain revoked. Old normal rescans and intentional
revocations cannot be safely distinguished retrospectively from that status
alone; this milestone does not blanket-unrevoke historical sessions. Recovery
supports existing authorized ended sessions and sessions retired by the corrected
rescan path. An explicit session denial retires only that session's FIFO head in
batches of at most 64, stopping at a different session. A permanent rejection of
one old event retires only that event. Current authorization failures still halt
the collector. Stored events, event IDs and
coordinates are never rewritten when a current credential is used on the wire.

The native queue is restricted to the existing approved BusSafe HTTPS endpoint.
Changing a JS-supplied server URL cannot authorize export to another project.
