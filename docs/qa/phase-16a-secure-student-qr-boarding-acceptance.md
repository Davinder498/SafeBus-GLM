# Phase 16A — Secure Student QR Boarding Manual Acceptance Guide

Status: implemented for review only. Do not accept or merge until product-owner hosted-DEV testing is complete.

## Setup
1. Apply `supabase/migrations/0043_secure_student_qr_boarding_foundation.sql` to hosted Supabase DEV through SQL Editor and reload PostgREST schema.
2. Use a Netlify deploy preview for this branch.
3. Use fake `@example.test` tenant admin, driver, guardian, and student identities only.
4. Optional fixture command after configuring hosted DEV: `SAFEBUS_QR_FIXTURE_CONFIRM=DEV_ONLY SAFEBUS_QR_FIXTURE_DATABASE_URL=postgres://... pnpm qa:seed:student-qr`.
5. On the driver device, use HTTPS and allow camera permission. If native `BarcodeDetector` is unavailable, use a browser with support or the DEV-only/manual QA token path.

## Credential lifecycle
- Tenant operational admin opens **Students → QR badge**.
- Generate a credential and print/save immediately; raw token cannot be fetched later.
- Rotate the credential; verify the old badge fails immediately.
- Revoke the active credential; verify the revoked badge fails.

## Pickup workflow
1. Start an active trip as the assigned driver.
2. Open `/driver/manifest` and then **Open scanner**.
3. Scan the badge and verify the confirmation screen shows only manifest-authorized student context.
4. Confirm pickup.
5. Verify the event appears in the manifest, guardian visibility, and notification outbox/email flow when configured.

## Drop-off workflow
1. Scan the same valid badge again on the same active trip.
2. Confirm drop-off.
3. Verify event state becomes complete and duplicate scans do not create duplicate events.

## Security and camera scenarios
Test wrong route, wrong tenant, no active trip, inactive student, revoked badge, malformed QR, repeated scan, guardian/admin role denials, Platform Super Admin operational denial, camera permission allowed/denied, no camera, scanner close/reopen, and mobile portrait no-horizontal-overflow.

## Acceptance table
| Scenario | Expected result | Actual result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Generate credential | One-time raw token and printable badge appears |  |  |  |
| Rotate credential | Old token fails; new token works on a valid future trip |  |  |  |
| Revoke credential | Revoked token fails generically |  |  |  |
| Pickup scan | Confirmation then pickup event and notification enqueue |  |  |  |
| Drop-off scan | Confirmation then drop-off event and notification enqueue |  |  |  |
| Wrong route/tenant | Generic invalid-badge denial |  |  |  |
| No active trip | Scanner/resolve cannot authorize event |  |  |  |
| Camera denied/no camera | Clear browser-state message and no continuous camera use |  |  |  |

Reusable printed QR codes can be copied; they are identifiers, not bearer authorization. Driver authentication, active-trip checks, route assignment, credential status, and confirmation are the safety model for Phase 16A.
