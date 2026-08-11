# Phase 7 — Production driver application and bus tracking

## Delivery status

Repository implementation is ready for hosted-DEV application and physical-device road testing. The Phase 7 exit gate is **not yet passed**: multi-hour road tests, measured battery/data limits, and hosted-DEV security execution require real devices and human approval.

## Platform decision

The initial production driver application is Android-only. An iOS driver application is not required for the first deployment because the operational device standard is a company-owned, managed Android handset assigned to each participating driver and mounted while that driver operates a bus. This avoids two independently validated background-location stacks during the safety-critical pilot.

Revisit iOS before contracting with an operator that cannot issue managed Android devices, requires iPhone support in its device policy, or approves personal-device use. An iOS decision must include a separate Core Location background-mode implementation and full repetition of this phase's road-test matrix; the Android service must not be represented as iOS-equivalent evidence.

## Device policy

Phase 7 permits **company-owned Android devices only**. The server refuses registrations marked as personal devices.

Required company-device controls:

- Android 10 or newer; Android 13+ preferred; current vendor security patches.
- Mobile-device management enrollment, screen lock, device encryption, remote lock/wipe, automatic time, and automatic application updates.
- SafeBus precise location set to **Allow all the time**, notifications enabled, background data allowed, and vendor battery “sleep”/optimization disabled for SafeBus.
- A working GNSS receiver and LTE/5G plan with rural roaming appropriate to the route.
- One named driver/custodian, inventory identifier, charging mount, and spare charging cable per device.
- No shared Google account and no sideloaded SafeBus builds. Release signing keys remain outside the repository.

Personal devices are prohibited for the pilot. A future BYOD policy would require explicit employer/legal approval, reimbursement and data-use terms, minimum OS/security posture, separation of work data, support boundaries, consent that is not relied upon as the sole legal authority, and an iOS decision. It is not enabled by this implementation.

## Runtime contract

1. An authenticated active driver scans the bus QR and starts or resumes the assigned trip.
2. The Android installation registers a rotated device credential. The server binds that device to the QR tracking session and authenticated driver.
3. Android starts a `location|dataSync` foreground service and shows a non-dismissible “SafeBus trip tracking” operating-system notification.
4. Every fix is assigned a UUID and monotonic sequence, encrypted with an Android Keystore AES-256-GCM key, and committed to a SQLite FIFO before network transmission.
5. The service sends FIFO entries one at a time. Accepted and server-confirmed duplicate events are removed. Network/server failures leave ciphertext queued for retry after restart or reboot.
6. The server derives tenant, driver, trip, bus, and route; the device cannot nominate any of them. It rejects another driver's device/session, revoked credentials, inaccurate or stale fixes, out-of-order events, duplicate identity reuse, and physically impossible jumps.
7. Ending/cancelling a trip stops collection immediately and keeps the foreground service only while required queued events recover. Pausing stops collection; resuming re-enables it. A remote server transition stops the service on its next successful exchange. The encrypted authorization also expires after 18 hours as an offline safety limit.

Queued fixes recorded during an authorized window may be recovered for 24 hours, including after a trip is completed. A fix recorded outside the server-known trip window is never promoted to current location.

## Adaptive cadence

Cadence is the slowest interval required by any active condition:

| Condition | Minimum interval |
|---|---:|
| Moving at 2 m/s or faster, connected, healthy battery | 5 seconds |
| Stationary | 30 seconds |
| Offline | 30 seconds |
| Battery at or below 20% | 60 seconds |
| Battery at or below 10% | 120 seconds |
| Android power-save mode | 90 seconds |
| Server-requested backoff | Server interval, at least 3 seconds |
| Paused/completed/cancelled/expired authorization | No collection |

The service requests a new GNSS cadence after each captured fix instead of keeping a continuous high-frequency watcher.

## Driver privacy and off-shift behaviour

SafeBus tracks the bus operating trip, not the child and not the driver's personal life.

- Collection starts only after the signed-in driver scans the assigned bus and receives an active server trip/session.
- The persistent Android notification is visible whenever location collection or required offline recovery is operating.
- Pause, end, cancel, server rejection, or the 18-hour authorization ceiling stops collection. The app has no general background-location mode outside this state.
- No home address, student address, health data, contacts, photos, microphone data, or location from another application is collected.
- Location history is operational data and follows the approved retention schedule and tenant access controls. Platform administrators and unrelated drivers do not receive it.
- Drivers must end the trip at the end of service and report a notification that remains after the queue has recovered. Supervisors investigate abnormal active trips; they do not use SafeBus as an off-shift employee-monitoring tool.

## Physical-device acceptance plan

Run against hosted Supabase DEV only after manually applying `0086_phase7_production_driver_tracking.sql`. Do not use production routes, student records, or production credentials.

For every scenario, record device model/OS, app version, trip/session IDs, start/end time, battery start/end, mobile bytes sent/received, queue high-water mark, accepted event count, duplicates, rejects by reason, and time to full recovery.

| Scenario | Procedure | Pass condition |
|---|---|---|
| Screen locked | Lock for at least 60 minutes while driving test route | Persistent notification remains; ordered fixes continue |
| App backgrounded | Use another app for 60 minutes | No collection gap beyond active cadence plus 30 seconds |
| Network loss | Disable data for 45 minutes, then restore | Queue grows encrypted; drains FIFO; no required event loss or duplicates |
| Crash/restart | Force-stop only for crash simulation, reopen; separately kill process without force-stop | Process restart resumes the still-authorized service; force-stop requires user reopen per Android security behaviour |
| Device reboot | Reboot mid-trip on managed device | Service/queue recover after boot with Always Location permission; notification returns |
| Low battery | Test at 20% and 10%, including power saver | Cadence changes to policy; queue/order remain correct |
| Rural connectivity | Drive representative coverage gaps | Offline queue recovers within 15 minutes of validated connectivity returning |
| Eight-hour day | Two realistic runs plus idle/paused periods | No off-trip fixes; no required loss; measurements remain inside approved limits |
| Remote trip end | End/cancel from authorized operations flow while device online | Service stops on next exchange and records no later fix |
| Forgery/cross-driver | Run Phase 7 RLS test plus API attempts with another driver/device/session | Every forged or cross-driver attempt is rejected and creates no location row |

Proposed limits for product-owner approval before road testing are no more than 20 percentage points of battery use attributable to SafeBus over an eight-hour screen-locked day, no more than 25 MB mobile data per eight-hour day, and full queue recovery with zero missing required event UUIDs. Record the approved values here before declaring the exit gate passed.

## Validation commands

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm --filter @safebus/mobile cap:sync
cd apps/mobile/android
./gradlew testDebugUnitTest assembleDebug lintDebug
```

Hosted DEV security test after migration application:

```bash
pnpm test:rls:dev -- tests/rls/phase7-production-driver-tracking-rls.sql
```

## Exit-gate checklist

Physical road testing and battery/data-limit approval were explicitly deferred on 2026-08-09 so Phase 8 implementation could begin. Phase 7 remains pending and must be resumed before production driver tracking is approved.

- [ ] Approved battery and mobile-data limits recorded.
- [ ] Multi-hour road tests completed on every supported device/OS class.
- [ ] Eight-hour representative operating day passed.
- [ ] No off-trip location rows observed.
- [ ] Offline recovery reconciled by event UUID with zero required loss.
- [ ] Hosted-DEV forgery/cross-driver security test passed.
- [ ] Product, privacy, operations, and driver representatives approved the evidence.
