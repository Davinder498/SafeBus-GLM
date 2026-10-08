# Student QR pickup and drop-off — 2026-10-08

Status: implemented for PR review; migration application, SQL execution, real-device acceptance, and deployment remain pending.

The customer authorized this named milestone and selected admin-only passes and an explicit Pickup/Drop-off mode with automatic recording. It promotes the earlier D1 experiment into development scope. The CR1 release approval and production gates are unchanged.

## Use

- Authorized tenant/transportation admins open a student's admin detail page; school admins may manage only their school's students. Generate a QR, then print or download the PNG immediately. The pass shows a first name and surname initial; its payload contains only a random opaque token.
- Replace invalidates the prior pass immediately. Revoke works even after student deactivation. The database stores only SHA-256 hashes, so a dismissed or lost image requires replacement. One active credential is permitted per student.
- Start the existing bus trip, open **Pickup & drop-off**, select **Pickup** or **Drop-off**, and scan the student pass. The server records the selected event without a confirmation step. **Scan next** retains the mode; repeated pickup scans cannot become drop-off.
- The scanner pauses during recording and releases the camera. Permission failures provide a retry; backgrounding stops camera access. Native QR detection has a lazy ZXing fallback. Frames stay on the device. Manual token entry is development-only.
- If a response is lost, **Retry same event** repeats the token, selected event, and displayed trip. The server returns the existing state without a duplicate event or notification. A failed list refresh does not negate a confirmed recording.

## Server contract

`record_student_qr_event_for_active_trip(p_qr_token text, p_event_type text, p_driver_trip_id uuid)` returns the authorized student's ID, display name, planned pickup/drop-off names, trip state, and an outcome: `recorded`, `already_recorded`, `pickup_required`, or `complete`. Events accept `picked_up` or `dropped_off`.

It locks the driver's displayed active trip, then student and credential, rechecks credential status, and resolves eligibility through the current manifest. The checks require an active authenticated driver, same tenant, active student, current bus service, route direction, service dates, and planned stop. It delegates new events to the existing internal recorder, preserving event timestamps, guardian visibility, notification preferences, and deduplication. It never uses legacy route-only assignments as a fallback.

The management/status RPCs use the current school-scoped roster authorization. The existing resolver is retained and hardened for compatibility, but the scanner no longer resolves and writes in separate calls. Credentials are RLS-enabled with no direct client privileges; the context/hash helpers are private and non-callable by client roles. Only signed-in authorized operational callers can use the public RPCs.

## Migration and release

The CLI-created migration was normalized to the repository's required four-digit version: `supabase/migrations/0119_student_qr_pickup_dropoff.sql`. It supports missing credential storage and surviving legacy storage without resetting, deleting, or rehashing existing credentials. Archived migrations remain archived. The new RPC type is staged from the declared migration contract; regenerate authoritative types after isolated migration validation.

Read-only production inspection found surviving legacy QR objects and no `safebus_release` identity/ledger. Production remains production-designated. No migration or fixture test is applied here. Pending migrations fail the current release closed until an isolated validation target is explicitly approved; adoption/release also needs the protected ledger process. Do not relax those guards, replay all migrations, use Docker, or apply SQL manually to production.

## Acceptance

Local tests cover independent PNG decoding; admin issuance, replacement, inactive revocation, printing and download; native/fallback detection; selected modes; duplicate outcomes; uncertain retries; camera denial, backgrounding, late permission responses and stale-trip callbacks; and confirmed-success refresh failures. The mobile Playwright suite exercises the shared driver page with fully intercepted placeholder Supabase traffic.

Validation passed: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` (281 web tests, 2 mobile tests, and 162 release tests), plus 5 mobile browser scenarios and 8 admin workspace browser scenarios. Migration checksums passed. PostgreSQL syntax parsing passed for the new migration and SQL test bodies; this did not execute SQL or validate database behavior. The build retains the existing large-chunk warning.

`tests/rls/student-qr-pickup-dropoff-rls.sql` is a self-contained executable test for a future approved isolated target. It creates uniquely scoped synthetic fixtures in one rollback-only transaction and does not disable triggers or security. Execute with `psql -v ON_ERROR_STOP=1` only after 0119 is validated there. On failure disconnect/rollback; never commit its transaction. It is not production execution evidence.

Isolated concurrency acceptance remains a release gate: use two authenticated connections on isolated synthetic trip/student fixtures. Send simultaneous Pickup requests, then simultaneous Drop-off requests; each pair must return one `recorded` and one `already_recorded`, with exactly one event and one notification per type. Race replacement/revocation against recording: the winner determines whether the scan records or is denied, with no post-revocation authorization. Repeat alongside the existing manual event recorder and while ending/replacing the trip. Keep production out of this exercise.

Real-device acceptance must cover the Android WebView decoder fallback, rear camera, denial/recovery, QR print/download quality, app backgrounding, and returning from the scanner while existing bus location tracking remains active. Browser mocks are not real-device proof.

Reusable passes can be copied; the pass alone never authorizes access or recording. No student GPS, offline queue, new notification channel, or guardian pass display is introduced.
