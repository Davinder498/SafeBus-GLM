# SafeBus Alberta — Phase 3 Data Inventory and Data-Flow Map

**Status:** Draft for counsel and privacy-professional review
**Owner:** Privacy Lead + Engineering Lead
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-09-02

---

## 1. Purpose

Phase 3 requires a **complete data inventory and data-flow map**, a
**documented legal authority and business purpose for every collected
field**, and a **field-elimination review** to remove anything unnecessary.
This document satisfies all three and is the field-level evidence backing
the PIA and retention schedule.

It is derived from the real schema in `supabase/migrations/` and
[`../data-classification.md`](../data-classification.md). Where a table is
marked **future-scope / drifted**, it is listed for transparency but is
not part of the approved current data inventory.

## 2. Data-flow summary

```
 Guardian / Driver / Admin browser  ──HTTPS──▶  Netlify (web app + Functions)
        │                                              │
        │                                       anon key + RLS
        │                                              ▼
        │                                   Supabase Postgres (ca-central-1)
        │                                   └─ profiles, students, guardians,
        │                                      drivers, trips, locations,
        │                                      notifications, audit, retention
        ▼
 Supabase Auth (ca-central-1) ── issues JWT ──▶ browser (anon session)

 Driver location (bus, active trip) ──RPC──▶ Supabase Postgres
        └─ read back via RPC by authorized guardian/admin (no direct table)

 Notification outbox ──Netlify Function (service role, server only)──▶ Resend (email)
        └─ recipient email resolved server-side; never exposed to browser
```

**Principles enforced by the architecture:**

- No personal data is processed in the browser beyond what RLS already
  authorizes that user to see.
- No service-role key ever reaches the browser or a log.
- No subprocessor receives personal data except as named in
  [`subprocessors.md`](./subprocessors.md) and approved by counsel.

## 3. Field-level inventory (current, approved scope)

Each row carries: field, table, purpose, lawful-basis category (draft),
recipient, and retention reference. "Lawful-basis category" is a draft
label for counsel to confirm; it is not a legal determination.

### 3.1 Identity — guardians, students, drivers

| Field                                                       | Table                              | Purpose                                  | Draft basis                                              | Recipients                                         | Retention                    |
| ----------------------------------------------------------- | ---------------------------------- | ---------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- | ---------------------------- |
| `email`                                                     | `profiles`, `guardians`, `drivers` | Login, contact, notifications            | Contract performance / legal obligation                  | Supabase Auth; email provider (notifications only) | Per §4                       |
| `role`                                                      | `profiles`                         | Authorization                            | Contract performance                                     | None (internal)                                    | Per account lifecycle        |
| `tenant_id`                                                 | `profiles`                         | Tenant isolation                         | Contract performance                                     | None (internal)                                    | Per account lifecycle        |
| `first_name`, `last_name`, `preferred_name`, `structured_*` | `students`, `guardians`, `drivers` | Identification within transportation ops | Contract performance / Education Act (student transport) | Tenant admins; assigned drivers (manifest only)    | Per §4                       |
| `grade`, `school_id`                                        | `students`                         | Routing/manifest context                 | Contract performance                                     | Tenant admins; assigned drivers                    | Per student record lifecycle |
| `phone` (if present)                                        | `guardians`, `drivers`             | Operational contact                      | Consent / contract performance                           | Tenant admins                                      | Per §4                       |

### 3.2 Relationships and authority

| Field                                                          | Table                                                                                                       | Purpose                                                                                          | Draft basis                          | Recipients                                                                     | Retention                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------- |
| `student_id`, `guardian_id`, relationship type                 | `student_guardians`                                                                                         | Authority for a guardian to view a student's assigned bus                                        | Contract performance / Education Act | Tenant admins                                                                  | Per §4                             |
| `can_receive_notifications`                                    | `student_guardians`                                                                                         | Consent flag for event notifications                                                             | Consent                              | Email provider and FCM (indirectly, only when the specific channel is enabled) | Per §4                             |
| Category and per-linked-student notification choices           | `user_notification_settings`, `user_notification_category_preferences`, `guardian_student_push_preferences` | User control of external notification delivery, quiet hours, urgent bypass, and private previews | Consent                              | None (internal)                                                                | Account or guardian-link lifecycle |
| `student_route_assignments`, `student_bus_service_assignments` | assignments                                                                                                 | Transportation linkage only (no home address)                                                    | Contract performance                 | Assigned drivers (manifest), tenant admins                                     | Per §4                             |

### 3.3 Transportation operations

| Field                                                          | Table       | Purpose                 | Draft basis          | Recipients                      | Retention   |
| -------------------------------------------------------------- | ----------- | ----------------------- | -------------------- | ------------------------------- | ----------- |
| `buses.*` (plate, capacity, identifier)                        | `buses`     | Vehicle management      | Contract performance | Tenant admins; assigned drivers | Operational |
| `routes`, `route_stops`, `route_shapes`, `route_trip_patterns` | routing     | Operational routes      | Contract performance | Tenant admins; assigned drivers | Operational |
| `driver_route_assignments`, `bus_route_assignments`            | assignments | Operational assignments | Contract performance | Tenant admins; assigned drivers | Operational |

### 3.4 Trips and live location

| Field                                                                                              | Table         | Purpose                                     | Draft basis                    | Recipients                                        | Retention                                |
| -------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------- | ------------------------------ | ------------------------------------------------- | ---------------------------------------- |
| `driver_trips.*`                                                                                   | trips         | Trip lifecycle                              | Contract performance           | Tenant admins; assigned drivers; linked guardians | Per §4                                   |
| `driver_trip_location_updates` / `driver_trip_current_locations` (coordinates, recorded_at, speed) | live location | **Bus** location during an active trip only | Contract performance / consent | Authorized guardians (RPC only); tenant admins    | Per §4 (raw history downsampled/deleted) |
| `student_trip_events` (pickup/drop-off)                                                            | events        | Operational record of stop events           | Contract performance           | Linked guardians; tenant admins                   | Per §4                                   |
| `bus_tracking_sessions`                                                                            | sessions      | Short-lived driver↔bus↔trip binding         | Contract performance           | Internal                                          | Auto-expire                              |

### 3.5 Notifications, audit, administration

| Field                                                                                                               | Table                      | Purpose                                                                       | Draft basis                                              | Recipients                                                                      | Retention                                                       |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `guardian_notification_outbox`                                                                                      | notifications              | Work items for pickup/drop-off emails                                         | Consent (`can_receive_notifications`)                    | Email provider (server only)                                                    | Per §4                                                          |
| Event/category/severity codes, safe source references, read/archive state                                           | `user_notifications`       | Authoritative role-scoped in-app inbox without copied names or arbitrary text | Contract performance / consent for linked-guardian scope | Authorized recipient only                                                       | 90 days                                                         |
| Protected FCM token, token hash, installation and permission state                                                  | `android_push_devices`     | Opt-in Android device delivery and revocation                                 | Consent                                                  | Google FCM (token and delivery metadata only)                                   | Active registration; stale/revoke after 90 days without refresh |
| Notification/device references, lease, attempt, provider status and normalized failure category                     | `push_notification_outbox` | Idempotent, retryable, authorization-rechecked Android push delivery          | Consent                                                  | Internal dispatcher; Google FCM receives only the resolved privacy-safe payload | 90 days after terminal state                                    |
| `audit_events`                                                                                                      | audit                      | Security accountability                                                       | Legitimate interest / legal obligation                   | Tenant admins (own trail); platform super admin (investigation)                 | Per §4                                                          |
| `invitations`, onboarding state                                                                                     | invitations                | Tenant-member onboarding                                                      | Contract performance                                     | Tenant admins (status only)                                                     | Per §4                                                          |
| `tenants` (name, identifier, status, timezone)                                                                      | tenants                    | Tenant identity                                                               | Contract performance                                     | Platform admin (narrow subset); tenant admins                                   | Account lifecycle                                               |
| `rate_limit_buckets`, `allowed_redirect_origins`, `password_policy`, `compromised_password_hashes`, `user_sessions` | security                   | Abuse prevention and account security                                         | Legitimate interest / legal obligation                   | Internal                                                                        | Shortest lawful period                                          |

## 4. Retention references (summary — full schedule in `retention-schedule.md`)

| Data class                                                  | Max retention                                                     | Mechanism                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Invitations                                                 | 90 days after consumed/expired                                    | Migration `0069` deletion job                                      |
| Student records                                             | While student is active + 13 months (draft)                       | Hard delete with dependent transportation records                  |
| Guardian relationships                                      | While link is active + grace period                               | Deletion job                                                       |
| Driver records                                              | While driver is active + 13 months (draft)                        | Operational identity anonymization; Auth deletion is separate      |
| Bus sessions and dispatches                                 | 30 days / 13 months                                               | Deletion job in dependency order                                   |
| Trip records                                                | 13 months (operational)                                           | Hard deletion job                                                  |
| Raw location history                                        | 30 days                                                           | Hard deletion job                                                  |
| Notifications (inbox and terminal email/push delivery rows) | 90 days                                                           | Deletion job                                                       |
| Android push registrations                                  | Active while opted in; revoke/stale after 90 days without refresh | Device cleanup job and immediate invalid-token/sign-out revocation |
| Audit records                                               | 24 months (draft; counsel confirms)                               | Anonymization job                                                  |
| Rate-limit buckets / session mirror                         | 2 days / 90 days                                                  | Deletion job                                                       |

## 5. Field-elimination review

The following were considered and **deliberately excluded** (see
[`../product-scope.md`](../product-scope.md) §2.1 and `AGENTS.md`):

- **Alberta Student Number / `asn` / `alberta_student_number`** — prohibited.
- **Student home address** — prohibited; only stop/route assignment stored.
- **Student health data** — prohibited.
- **Custody narratives / family-court details** — prohibited; guardian
  authority is verified operationally (see
  [`guardian-authority-verification.md`](./guardian-authority-verification.md)).
- **Per-child GPS / wearables** — prohibited; only the **bus** is tracked.
- **Driver license raw images** — only a verification status is stored.
- **Free-text notes that could carry prohibited data** — controlled formats
  only; `audit_events.detail` sanitizes secret-like keys.

Any field not listed in §3 is **out of scope** for collection. New fields
require a `decision-log.md` entry and an update to this inventory in the
same PR.

## 6. Drifted / future-scope tables (not current inventory)

These are listed for transparency and are **not** part of the approved
current data inventory. Their handling is decided in
[`../feature-inventory.md`](../feature-inventory.md):

- `student_qr_credentials` — student badges (D1, quarantined).
- Safe ETA helpers (D3) — quarantined from the UI.
- Bus QR sessions (D2) — promoted-with-milestone, bus not child.

If any of these are promoted to current scope, this inventory and the PIA
must be updated and re-approved before activation.

## 7. Subprocessor data flow

See [`subprocessors.md`](./subprocessors.md) for the full list. In summary,
personal data potentially reaches:

- **Supabase** (Postgres + Auth) — primary data store and auth, ca-central-1.
- **Netlify** — application hosting and Functions; holds no at-rest personal
  data beyond ephemeral request processing.
- **Email provider** (Resend or approved alternative) — recipient email and
  notification content only, in transit.
- **Google Firebase Cloud Messaging** — receives the opt-in device token,
  privacy-safe generic or event-type-only push content, device IP address, and
  ordinary delivery metadata. SafeBus sends no student name, route, stop,
  coordinate, driver identity, tenant identifier, or internal identifier in the
  push payload.
- **Geoapify** (pilot map provider) — receives tile coordinates, the requesting
  device IP address, HTTP origin/referrer, and ordinary request metadata. SafeBus
  sends no account, student, guardian, driver, bus, or trip identifier. Tile
  coordinates necessarily describe the map viewport and must not be described
  as carrying no information.
- **Monitoring/error reporting** (future) — must be configured to strip
  personal data before any cross-border transmission; counsel approval
  required.

## 8. Counsel confirmation items

- [ ] Confirm draft lawful-basis labels in §3 for each field.
- [ ] Confirm retention periods in §4 / `retention-schedule.md`.
- [ ] Confirm no field in §3 should be eliminated or further minimized.
- [ ] Confirm subprocessor data flows in §7 are within the approved
  customer instructions.
