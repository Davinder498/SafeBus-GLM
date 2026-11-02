# Driver tracking status acceptance

This slice fixes the driver's Android tracking status. It does not complete rural
operations, change location cadence or delivery guarantees, or establish physical
device readiness. No database migration, production write, notification, merge,
or deployment is part of this change.

## Acceptance boundary

| Account                                            | Expected behavior                                                                                                                                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driver                                             | Observe only this account's configured tracking session. A paused or ended collector can still show pending delivery. Opening a screen or polling must never resume collection. Optional MFA remains optional.               |
| Guardian                                           | No driver status restoration or collection controls. Existing linked-student bus visibility remains separate.                                                                                                                |
| School authority admin                             | No driver status restoration; existing operations and mandatory administrator MFA remain.                                                                                                                                    |
| Transportation admin                               | Same boundary as school authority admin, within existing authority scope.                                                                                                                                                    |
| Retired school-scoped admin                        | No restored access.                                                                                                                                                                                                          |
| Platform admin                                     | No driver status restoration or tracking access.                                                                                                                                                                             |
| Signed out, expired, suspended, or loading account | Existing Auth/route/session checks still govern access. No former account status may appear in a replacement account. Failed status reads replace prior success. Stop/pause must still reach Android if the Auth read fails. |

## Status contract

- Protocol 2 acknowledgements are encrypted presentation metadata scoped to both
  the JWT subject and tracking token. Decoding the subject is only for local
  display scope; signed JWT validation and ingestion authorization remain on the
  server. Neither subject, token nor coordinates are returned in status results.
- A non-driver account stops the possible previous collector without restoring
  its status. A replacement driver with no owned native session does the same.
  Authorized queued recovery retains its existing service rules.
- Acknowledgements from an earlier FIFO entry or replaced configuration cannot
  mark a new trip as delivered. The old global acknowledgement is ignored.
- Active delivery needs a current-session acknowledgement no older than two
  minutes, within the existing 30-second future tolerance, and no pending work.
  Browser offline or Android's unvalidated connectivity overrides a fresh ack.
  Freshness expires independently of polling; an unresponsive status read shows
  an error after 15 seconds without starting overlapping replacement reads.
- A stopped collector with queued delivery is a separate recovery state. Errors
  disclose known pending delivery without claiming that uploading is occurring.
- Each status read examines at most one encrypted queue row. A matching newest
  row proves pending work for this session; an empty queue proves none. A
  nonmatching tail cannot prove absence of older matching work and yields an
  unconfirmed status. There is no invented exact count: `queuedEvents` is null for
  nonempty or unreadable queues, with `pendingDelivery` when known. The FIFO,
  encrypted schema, ordering, retry pump and discard policy are unchanged.
- Presentation storage/read failures do not stop or resume the service. Existing
  service authorization and permission failures remain visible as actionable
  status errors. Protocol 1 status requires an Android app update to verify.
- Only an explicit resume or activation starts native collection. The existing
  browser geolocation fallback keeps its previous start behavior.
- Recorded successful-update timestamps use the pinned Alberta timezone helper,
  including date and offset, rather than the installed runtime's older timezone.

## Local verification

Automated tests cover freshness/future bounds, unscoped legacy acknowledgements,
bounded pending evidence, offline polling, stopped recovery, status failure and
retry, single-flight reads, late replies, account removal, explicit pause/resume,
role restoration boundaries, and native acknowledgement scope predicates.
Browser fixtures exercise the actual mobile entry point and block external
requests. They do not exercise the Android OS service, Keystore or SQLite engine.

Run the repository checks, mobile build followed by Android sync, and Android
`testDebugUnitTest assembleDebug lintDebug`. Record the exact results in the PR.

## Protected release and physical acceptance

Ship the Android plugin and its bundled JavaScript together through the existing
reviewed release process. Roll back by restoring the prior reviewed application
bundle, preserving the queue and device credentials. The new encrypted metadata
is additive and ignored by the prior binary. Old acknowledgements are not
imported into the new binary; it waits for a new successful current-trip update.

Before claiming physical-device readiness, while parked and using an approved
bounded verification setup, record:

1. Start a synthetic authorized trip; verify the first actual acknowledgement,
   its Alberta date/offset, and delayed status after two minutes without another.
2. Remove connectivity; verify offline remains after repeated polls. Restore it
   and compare acknowledged events, ordered FIFO recovery and the status display.
3. Pause, navigate away/back and reopen the app. Collection must stay paused while
   known queued recovery remains visible. Repeat after end/cancel and drain.
4. Replace a trip with an older queue still present. Old event acknowledgements
   must not mark the replacement active; a mixed queue can show unconfirmed.
5. Sign out, switch drivers and test rejected/expired authorization. Do not expose
   another account's timestamps or pending status; verify collection stops under
   the existing authorization rules and recipient notifications are not sent as QA.
6. Check denied precise/background location and disabled location services, native
   status read failure, service suspension/recreation, and recovery after reopening.
7. Verify a long offline backlog does not make status polling scan the queue or
   alter cadence, battery use, upload order or retry behavior.

These device checks, Play publication and installation are release dependencies,
not outcomes of a local build or Android sync. The production database timezone
upgrade remains a separate protected operational dependency from reporting.
