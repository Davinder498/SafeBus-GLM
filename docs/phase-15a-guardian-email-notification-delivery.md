# Phase 15A — Guardian Event Email Notification Delivery Foundation

## Repository findings

- Guardian emails are stored in `public.guardians.email` and mirrored in `public.profiles.email`; guardian domain rows connect to Auth users through `guardians.profile_id -> profiles.id -> auth.users.id`.
- Existing onboarding invites or reuses Auth users, upserts `profiles`, then upserts guardian rows with the same email and creates `student_guardians` links.
- Email can be resolved from application tables server-side without Auth Admin lookup during dispatch.
- `student_guardians.can_receive_notifications` is the existing event-notification eligibility flag and is already used by Milestone 9A outbox enqueue logic. Phase 15A reuses it for pickup/drop-off email MVP and revalidates it immediately before send. No channel-specific preference table exists.
- The Milestone 9A outbox had pending/delivered/failed/cancelled states and uniqueness but lacked atomic claiming, attempts, leases, and provider references.
- The repository already uses Netlify Functions with service-role Supabase access for trusted onboarding, so Phase 15A uses a secured Netlify server function rather than browser code or Supabase Edge Functions.

## Implementation

- Adds migration `0038_guardian_email_notification_delivery_foundation.sql` with `processing`, attempt count, claim lease fields, provider message reference, failure category, and service-role-only RPCs for claim, resolve, complete, retry, fail, and cancel.
- Dispatcher endpoint: `POST /.netlify/functions/guardian-notification-email` with `x-safebus-dispatcher-secret`.
- Provider: Resend transactional email API. Provider-specific code is isolated in the Netlify function; core template, classification, retry, idempotency, and log redaction helpers are unit-tested.
- Recipient source: server-side `guardians.email` with `profiles.email` fallback after tenant/profile/guardian/student/link/event validation.
- Email content is minimal: student first name, event type, UTC event time, and a statement that this is recorded transportation-system activity rather than live child tracking.

## Lifecycle, retry, and idempotency

Lifecycle: `pending -> processing -> delivered`, `pending/processing -> cancelled`, or `processing -> pending/failed` for retryable failures. Claims use `FOR UPDATE SKIP LOCKED` with bounded batches and an expiring lease. Temporary provider failures retry with conservative backoff (5 minutes, 15 minutes, 1 hour, then 3 hours) up to five attempts; permanent failures become terminal `failed`; revoked eligibility becomes `cancelled`.

The dispatcher passes a stable Resend `Idempotency-Key` derived only from the outbox row id. If the provider accepts a send but the worker loses the response before marking delivered, provider idempotency reduces duplicate risk, but final provider semantics still govern that ambiguity.

## Environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SAFEBUS_NOTIFICATION_DISPATCHER_SECRET`
- `SAFEBUS_EMAIL_PROVIDER_API_KEY`
- `SAFEBUS_EMAIL_FROM`
- `SAFEBUS_EMAIL_FROM_NAME` (optional)
- `SAFEBUS_NOTIFICATION_BATCH_SIZE` (optional)
- `SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE` (DEV/deploy-preview only)

Never expose these through `VITE_` variables.

## Status

Automated validation is pending in the PR until CI/deploy preview runs. Hosted-DEV migration, provider sandbox delivery, and manual acceptance remain pending product-owner QA approval.
