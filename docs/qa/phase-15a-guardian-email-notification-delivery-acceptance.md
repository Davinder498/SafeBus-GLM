# Phase 15A Guardian Event Email Notification Delivery — Manual Acceptance Guide

## Setup

- Branch: `phase-15a-guardian-email-notification-delivery`; deploy preview must target this branch and `main`.
- Hosted Supabase DEV is required. Do not run local Docker, `supabase start`, or `supabase db reset`.
- Apply `supabase/migrations/0038_guardian_email_notification_delivery_foundation.sql` manually in hosted DEV SQL Editor after all prior migrations through `0037`.
- Required Netlify server environment variables (no `VITE_` secrets):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SAFEBUS_NOTIFICATION_DISPATCHER_SECRET`
  - `SAFEBUS_EMAIL_PROVIDER_API_KEY`
  - `SAFEBUS_EMAIL_FROM`
  - `SAFEBUS_EMAIL_FROM_NAME` (optional)
  - `SAFEBUS_NOTIFICATION_BATCH_SIZE` (optional, default 10, max 50)
  - `SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE` for deploy previews and DEV only
- Provider: Resend transactional email API. Verify the sender/domain before live testing.
- Safe DEV mode: set `SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE` to a controlled QA inbox in non-production Netlify contexts. The dispatcher still revalidates the original guardian, link, tenant, event, and consent before routing the actual message to the QA inbox.
- Fixture setup: use existing tenant, driver, guardian, route, student, trip, and event QA fixtures, or seed through existing admin/driver flows.
- Test accounts: tenant admin, assigned driver, linked guardian, unlinked/cross-tenant guardian, and Platform Super Admin.

## Pickup flow

1. Start a valid driver trip.
2. Record a student pickup.
3. In trusted SQL, confirm one `pending` outbox row per active linked guardian with `can_receive_notifications = true`.
4. Invoke the dispatcher with `POST /.netlify/functions/guardian-notification-email` and header `x-safebus-dispatcher-secret`.
5. Confirm the QA override inbox receives the pickup email.
6. Confirm the row becomes `delivered` with `delivered_at` and, when returned, a provider message reference.
7. Invoke the dispatcher again and confirm no second email is received for the same outbox row.

## Drop-off flow

Repeat the pickup flow for a valid drop-off event and confirm the message says drop-off rather than pickup.

## Preference and eligibility checks

Verify notifications enabled; notifications disabled; inactive guardian; inactive student-guardian link; missing recipient email; cross-tenant guardian; and link removed after enqueue but before send. Revoked or missing eligibility must cancel rather than send.

## Failure and retry checks

Verify temporary provider failure schedules delayed retry; later success becomes delivered; invalid-recipient/permanent failure becomes failed; maximum attempts becomes failed; an expired processing lease can be claimed by a later dispatcher run.

## Privacy checks

Verify guardian receives only their linked student's event; no coordinates, addresses, route history, driver details, other students, tenant IDs, UUIDs, or provider diagnostics appear in email; browser users cannot read the outbox; tenant admins cannot inspect another tenant; Platform Super Admin cannot inspect tenant notification operations; logs do not contain recipient emails or message bodies.

## Acceptance record

| Scenario | Expected result | Actual result | Pass/Fail | Notes |
|---|---|---|---|---|
| Pickup email | One QA email; outbox delivered |  |  |  |
| Drop-off email | One QA email; outbox delivered |  |  |  |
| Duplicate dispatcher | No duplicate email |  |  |  |
| Consent disabled | Outbox not enqueued or cancelled before send |  |  |  |
| Link removed | Cancelled before send |  |  |  |
| Temporary failure | Pending with delayed retry |  |  |  |
| Permanent failure | Failed with normalized category |  |  |  |
| Browser outbox privacy | No browser read/mutate access |  |  |  |

Phase 15A is not accepted until product-owner manual testing and approval are recorded. Do not merge before approval.
