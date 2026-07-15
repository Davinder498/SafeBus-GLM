# Phase 15B — Notification Delivery Validation & Operational Hardening

## Manual Acceptance Guide

Phase 15B proves that the Phase 15A guardian pickup/drop-off email delivery system works safely and reliably in hosted Supabase DEV and a Netlify deploy preview. It adds the smallest reliable production-compatible scheduler, tenant time-zone formatting, privacy-safe diagnostics, and a minimal tenant-admin operational summary.

---

## 1. Environment setup

### 1.1 Migrations

Apply all migrations through `0039` to hosted Supabase DEV in order, via the SQL Editor:

```bash
# Already applied through 0037 (Phase 15A baseline)
# 0038_guardian_email_notification_delivery_foundation.sql  (Phase 15A)
# 0039_notification_delivery_hardening_tenant_timezone_summary.sql (Phase 15B)
```

Validation queries (run as service role):

```sql
-- Confirm tenant timezone column exists
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'tenants' and column_name = 'timezone';

-- Confirm all lifecycle functions exist with safe search_path
select proname, proconfig from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in (
  'claim_guardian_notification_email_batch',
  'resolve_guardian_notification_email_payload',
  'complete_guardian_notification_email',
  'retry_guardian_notification_email',
  'fail_guardian_notification_email',
  'cancel_guardian_notification_email',
  'get_tenant_notification_delivery_summary'
);

-- Confirm browser roles lack execute on privileged functions
-- (Should return no grants to anon/authenticated for the worker RPCs)
```

### 1.2 Resend sender configuration

1. Log in to Resend.
2. Verify the sender domain/address used in `SAFEBUS_EMAIL_FROM`.
3. Obtain a valid API key for `SAFEBUS_EMAIL_PROVIDER_API_KEY`.

### 1.3 Netlify deploy-preview environment variables

Set these server-side variables in Netlify (no `VITE_` secrets):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Hosted DEV Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only) |
| `SAFEBUS_NOTIFICATION_DISPATCHER_SECRET` | Shared secret for manual POST invocation |
| `SAFEBUS_EMAIL_PROVIDER_API_KEY` | Resend API key |
| `SAFEBUS_EMAIL_FROM` | Verified sender address |
| `SAFEBUS_EMAIL_FROM_NAME` | Display name (optional, default `SafeBus Alberta`) |
| `SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE` | Controlled QA inbox for deploy previews |
| `SAFEBUS_NOTIFICATION_BATCH_SIZE` | Optional, default 10, max 50 |

### 1.4 Schedule configuration

The scheduled function is configured in `netlify.toml`:

```toml
[functions."guardian-notification-email-scheduled"]
  schedule = "@hourly"
```

This runs conservatively once per hour. Overlapping executions are safe because the claim RPC uses `for update skip locked`.

### 1.5 Fixture command

```bash
SAFEBUS_QA_SEED_DATABASE_URL=postgresql://... \
SAFEBUS_QA_SEED_CONFIRM=DEV_ONLY \
pnpm qa:seed:notifications
```

This creates a fake tenant (`7c100000-...000002`), guardian, driver, student, route, bus, trip, and consent link using `@example.test` identities. It refuses production execution.

### 1.6 Test accounts

| Role | Email | Purpose |
|---|---|---|
| Driver | `qa-driver-15b@example.test` | Records pickup/drop-off events |
| Guardian | `qa-guardian-15b@example.test` | Eligible recipient |
| Tenant Admin | (your tenant admin account) | Views operational summary |
| Platform Super Admin | (your platform account) | Must be denied tenant summary |

---

## 2. Pickup test

1. Log in as the QA driver (`qa-driver-15b@example.test`).
2. Open `/driver/manifest`.
3. Record a **pickup** for `QA Student`.
4. In trusted SQL, confirm exactly one `pending` outbox row:

   ```sql
   select status, notification_type, attempt_count, available_after
   from public.guardian_notification_outbox
   where tenant_id = '7c100000-0000-0000-0000-000000000002';
   ```

5. Invoke the dispatcher manually:

   ```bash
   curl -X POST \
     https://<deploy-preview>.netlify.app/.netlify/functions/guardian-notification-email \
     -H "x-safebus-dispatcher-secret: $SAFEBUS_NOTIFICATION_DISPATCHER_SECRET"
   ```

6. Confirm the QA override inbox receives a **pickup** email.
7. Confirm the outbox row is `delivered` with `delivered_at` and a `provider_message_id`.
8. Invoke the dispatcher again and confirm **no second email** is received.

**Expected**: one email, one `delivered` row, no duplicates.

---

## 3. Drop-off test

Repeat the pickup test for a **drop-off** event. Confirm the message wording says "drop-off" rather than "pickup". Confirm the event time uses the tenant Alberta time zone (e.g., `MDT`/`MST` label), not raw UTC.

---

## 4. Retry tests

### 4.1 Temporary failure

To simulate a temporary provider failure, point `SAFEBUS_EMAIL_PROVIDER_API_KEY` at an invalid key temporarily, or use a controlled mock.

1. Record a pickup event.
2. Invoke the dispatcher.
3. Confirm the row returns to `pending` with `failure_category = 'temporary_provider_error'` and an `available_after` in the future.
4. Confirm the row is **not** claimable until `available_after` passes.

### 4.2 Eventual delivery after retry

1. Restore the valid provider key.
2. Wait for the retry delay to pass (or manually backdate `available_after`).
3. Invoke the dispatcher again.
4. Confirm the row becomes `delivered`.

### 4.3 Permanent failure

1. Use a permanently invalid recipient or a 422 response.
2. Confirm the row becomes `failed` with the normalized category.
3. Confirm it is **never reclaimed** by subsequent dispatcher runs.

### 4.4 Maximum attempts

1. Force repeated temporary failures.
2. Confirm after `attempt_count` reaches the maximum (`5`), the row transitions to `failed`.

---

## 5. Eligibility tests

### 5.1 Disable notifications after enqueue

1. Record a pickup event (creates a `pending` row).
2. Update `student_guardians.can_receive_notifications = false`.
3. Invoke the dispatcher.
4. Confirm the row is `cancelled` with `failure_category = 'eligibility_revoked'` and **does not later retry**.

### 5.2 Deactivate guardian-student link

1. Set `student_guardians.status = 'inactive'`.
2. Invoke the dispatcher.
3. Confirm `cancelled`, not sent.

### 5.3 Deactivate guardian

1. Set `guardians.status = 'inactive'`.
2. Invoke the dispatcher.
3. Confirm `cancelled`.

### 5.4 Remove recipient email

1. Clear/null the guardian/profile email.
2. Invoke the dispatcher.
3. Confirm `cancelled` with `failure_category = 'missing_recipient_email'`.

### 5.5 Cross-tenant mismatch

1. Attempt to claim/resolve with mismatched tenant IDs.
2. Confirm the payload-resolution join returns no rows and the outbox is cancelled.

---

## 6. Scheduling tests

### 6.1 Scheduled invocation

1. With pending outbox rows, wait for the hourly schedule (or invoke the scheduled function URL directly).
2. Confirm rows transition through the lifecycle.

### 6.2 Manual secure invocation

```bash
curl -X POST https://<deploy-preview>.netlify.app/.netlify/functions/guardian-notification-email \
  -H "x-safebus-dispatcher-secret: $SAFEBUS_NOTIFICATION_DISPATCHER_SECRET"
```

### 6.3 Simultaneous invocation

1. Fire two POST requests concurrently.
2. Confirm each outbox row is processed by exactly one invocation (no duplicates).
3. This is guaranteed by `for update skip locked` in the claim RPC.

### 6.4 Expired claim recovery

1. Claim a batch and kill the function before completion.
2. Wait for the lease to expire (default 120s; minimum 30s).
3. Invoke the dispatcher again.
4. Confirm the expired-lease `processing` row is re-claimed and completed.

---

## 7. Privacy tests

### 7.1 Received email content

Confirm the received email contains **only**:

- the student's first name;
- pickup or drop-off event wording;
- authoritative event time in the tenant Alberta time zone;
- a statement that this is an event recorded by the transportation system;
- a statement that it is **not** live child tracking.

Confirm it does **not** contain: surname, guardian email in the body, coordinates, route name, stop name/address, bus number, driver name/phone, school information, internal IDs, or provider diagnostics.

### 7.2 Logs

Review Netlify function logs. Confirm they contain **only**: outbox correlation ID, attempt number, notification type, normalized result, normalized failure category, processing duration. No recipient emails, names, message bodies, API keys, or provider response bodies.

### 7.3 Tenant-admin summary

Log in as a tenant/school/transportation admin and open `/admin/trips`. Confirm the "Notification delivery" card shows: pending, processing, delivered (24h), failed (24h), cancelled, oldest pending age, and normalized failure categories. Confirm it shows **no** recipient emails, guardian/student names, message bodies, or provider message IDs.

### 7.4 Browser-role denial

Confirm a guardian, driver, or Platform Super Admin cannot access `/admin/trips` (or the tenant summary RPC).

---

## 8. Acceptance record

| Scenario | Expected result | Actual result | Pass/Fail | Notes |
|---|---|---|---|---|
| Migration 0039 applies cleanly | All columns/functions exist |  |  |  |
| Pickup email | One QA email; outbox delivered |  |  |  |
| Drop-off email | One QA email; correct wording; Alberta time zone |  |  |  |
| Duplicate dispatcher | No duplicate email |  |  |  |
| Temporary failure | Pending with delayed retry |  |  |  |
| Permanent failure | Failed with normalized category |  |  |  |
| Maximum attempts | Failed after 5 attempts |  |  |  |
| Consent disabled | Cancelled before send |  |  |  |
| Link removed | Cancelled before send |  |  |  |
| Guardian deactivated | Cancelled before send |  |  |  |
| Missing recipient email | Cancelled, no retry |  |  |  |
| Cross-tenant mismatch | Cancelled, no send |  |  |  |
| Concurrent claims | No row processed twice |  |  |  |
| Expired lease recovery | Row re-claimed after lease expiry |  |  |  |
| Scheduled invocation | Rows processed without browser user |  |  |  |
| Email content privacy | No surname, coordinates, route, stop, bus, driver, IDs |  |  |  |
| Logs privacy | No emails, bodies, keys |  |  |  |
| Tenant-admin summary | Safe counts only; no personal info |  |  |  |
| Guardian/driver denial | Cannot access admin trips |  |  |  |
| Platform Super Admin denial | Cannot access tenant summary |  |  |  |
| Mobile layout | No horizontal overflow |  |  |  |

Phase 15B is **not accepted** until product-owner manual testing is recorded. Do not merge before approval.