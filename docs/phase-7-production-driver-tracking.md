# Phase 7 — Production driver application and bus tracking

## Delivery status

Repository implementation includes the Android BYOD contract, permission flow, and signed-bundle pipeline. The Phase 7 exit gate is **not yet passed**: the migration is unapplied, no isolated test database is approved, Play background-location review is incomplete, and multi-hour personal-device road tests and measured battery/data limits require real devices and human approval.

## Platform decision

Commercial Release 1 uses one Android application for drivers and guardians. The authenticated role determines which routes and capabilities are available; guardian accounts cannot reach driver operations or native tracking controls. Drivers use their own compatible Android phone, mounted and powered while operating a bus.

iOS is deferred by `DL-017`. A later iOS milestone requires a separate Core Location background-mode implementation, App Store privacy work, signed delivery pipeline, and full repetition of the road-test matrix. Android evidence must not be represented as iOS-equivalent evidence.

## Device policy

Phase 7 permits compatible **personally owned Android phones**. Migration `0090_phase7_byod_android_tracking.sql` replaces new company-device registration with a versioned personal-device location-notice contract. It does not apply itself to the sole production database.

Required personal-device controls:

- Android 10 is the technical minimum; production eligibility also requires an OS version still receiving vendor security updates and a security patch no more than 90 days old.
- Secure screen lock, device encryption, automatic time, official Google Play installation, automatic SafeBus updates, and no root or unlocked bootloader.
- SafeBus precise location set to **Allow all the time**, notifications enabled, background data allowed, and vendor battery “sleep”/optimization disabled for SafeBus.
- A working GNSS receiver and LTE/5G plan with rural roaming appropriate to the route.
- A fixed charging mount and cable in the bus. Setup and troubleshooting occur only while parked.
- No shared SafeBus driver account and no sideloaded builds. Release signing keys remain outside the repository.
- Immediate reporting of a lost, stolen, replaced, or compromised phone so the account session and app device credential can be revoked.

SafeBus controls only its app storage, session, and device credential. It does not assume MDM enrollment, remote wipe, or access to unrelated personal data. Before a real driver participates, the customer must approve its workplace/BYOD policy, lawful authority, reimbursement or mobile-data terms, minimum security posture, incident reporting, support boundaries, and an alternative for a driver who does not have an eligible phone. Clicking the in-app disclosure is not treated as the customer's sole legal authority.

For a lost, stolen, replaced, or compromised phone, a tenant administrator uses **Revoke phone tracking** on the driver's detail page. The audited action revokes every native tracking credential and SafeBus refresh session for that driver; it does not inspect or erase the personal phone. Operations must also end or reassign any affected active trip. The driver signs in again on an eligible phone and repeats the current disclosure and registration flow.

## Runtime contract

1. An authenticated active driver scans the bus QR and starts or resumes the assigned trip.
2. Before Android requests location permission, SafeBus displays the versioned personal-device disclosure. The installation then registers a rotated device credential and acknowledgment version. The server binds that device to the QR tracking session and authenticated driver.
3. Android starts a `location` foreground service and shows a non-dismissible “SafeBus trip tracking” operating-system notification. The service deliberately does not declare `dataSync`, which is time-limited on current Android versions and would interrupt an eight-hour operating day.
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
- No device-management profile is installed. SafeBus cannot inspect or erase unrelated personal content.
- Location history is operational data and follows the approved retention schedule and tenant access controls. Platform administrators and unrelated drivers do not receive it.
- Drivers must end the trip at the end of service and report a notification that remains after the queue has recovered. Supervisors investigate abnormal active trips; they do not use SafeBus as an off-shift employee-monitoring tool.

## Physical-device acceptance plan

Run only against an explicitly approved isolated Supabase test database after manually applying migrations through `0090_phase7_byod_android_tracking.sql`. No such target is currently approved. Do not run these tests or fixtures against the sole production database, and do not use real routes, student records, or production credentials.

For every scenario, record device model/OS, app version, trip/session IDs, start/end time, battery start/end, mobile bytes sent/received, queue high-water mark, accepted event count, duplicates, rejects by reason, and time to full recovery.

| Scenario | Procedure | Pass condition |
|---|---|---|
| Screen locked | Lock for at least 60 minutes while driving test route | Persistent notification remains; ordered fixes continue |
| App backgrounded | Use another app for 60 minutes | No collection gap beyond active cadence plus 30 seconds |
| Network loss | Disable data for 45 minutes, then restore | Queue grows encrypted; drains FIFO; no required event loss or duplicates |
| Crash/restart | Force-stop only for crash simulation, reopen; separately kill process without force-stop | Process restart resumes the still-authorized service; force-stop requires user reopen per Android security behaviour |
| Device reboot | Reboot mid-trip on a personal device | Service/queue recover after boot with Always Location permission; notification returns |
| Shared binary / guardian | Sign in as a guardian on the same release build | Guardian portal works; no driver scan, tracking permission prompt, device registration, or driver data is reachable |
| BYOD security | Test lost-device revocation, sign-out, app update, phone replacement, screen lock, and denied/revoked permissions | Credentials/session can be revoked; denied access fails closed; unrelated personal content is never exposed |
| Vendor battery controls | Test each supported Samsung/Google/Motorola class with screen locked | Active-trip cadence survives documented vendor optimization settings or the model is removed from support |
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

Isolated-test-database security test after migration application (currently blocked by the one-production-database policy):

```bash
pnpm test:rls:dev -- tests/rls/phase7-production-driver-tracking-rls.sql
```

## Exit-gate checklist

The Android BYOD repository work resumed on 2026-08-15 under `DL-017`. Phase 7 remains pending until the following evidence is completed and approved.

- [ ] Approved battery and mobile-data limits recorded.
- [ ] Multi-hour road tests completed on every supported device/OS class.
- [ ] Eight-hour representative operating day passed.
- [ ] No off-trip location rows observed.
- [ ] Offline recovery reconciled by event UUID with zero required loss.
- [ ] Isolated-test-database forgery/cross-driver security test passed.
- [ ] Google Play background-location declaration, review video, Data safety form, test account, and public privacy-policy URL approved.
- [ ] Signed AAB workflow executed for an exact reviewed commit and its signature verified.
- [ ] Customer BYOD policy, driver support/reimbursement terms, and lost-device process approved.
- [ ] Shared guardian/driver binary verified with no cross-role access.
- [ ] Product, privacy, operations, and driver representatives approved the evidence.
