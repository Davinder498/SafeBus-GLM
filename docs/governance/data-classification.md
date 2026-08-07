# SafeBus Alberta — Data Classification Standard

**Status:** Draft — awaiting product-owner and security sign-off
**Owner:** Security Lead
**Phase:** 0 — Product and governance baseline
**Last updated:** 2026-08-06

---

## 1. Purpose

Every table, RPC return set, log line, and external message in SafeBus must
map to exactly one classification. The classification decides RLS strictness,
retention, logging, breach-notification handling, and what platform
administrators are allowed to touch.

## 2. The four classification tiers

| Tier | Examples (from the plan) | Handling summary |
| --- | --- | --- |
| **Restricted** | Student identity, guardian relationships, driver licensing | RLS mandatory; no platform-admin access; minimal field surface; strongest retention/breach controls. |
| **Confidential** | Live location, routes, assignments | RLS mandatory; tenant-scoped only; derived/ephemeral access for operational roles; tight retention for live data. |
| **Internal** | Tenant settings and operational metrics | Authenticated tenant roles only; no public access; moderate retention. |
| **Public** | Marketing content | No access control; no personal data; no operational data. |

## 3. Classification of actual SafeBus tables

This maps the real tables that exist in `supabase/migrations` to the four
tiers. "Drifted / future-scope" tables are marked and must be resolved in
Phase 0/Phase 1 per [`feature-inventory.md`](./feature-inventory.md).

### 3.1 Restricted

| Table | Why restricted | Notes |
| --- | --- | --- |
| `students` | Student identity (name, grade, school) | No ASN, no address, no health data. Guardian visibility limited to linked rows. |
| `guardians` | Guardian identity and contact | Email/contact tightly scoped. |
| `student_guardians` | Guardian relationships + notification consent | The authority-to-view link; minimal exposure. |
| `drivers` | Driver identity and licensing attributes | Licensing fields restricted; contact minimal. |
| `student_qr_credentials` **(drifted / future-scope)** | Hashed student badge tokens | Currently violates "no student badges" rule. Decision pending in feature inventory. |
| `bus_qr_credentials` **(operational credential)** | Hashed bus QR tokens | Treated as Restricted because compromise enables impersonation. |
| `bus_tracking_sessions` | Short-lived driver↔bus↔trip binding | Restricted; auto-expires. |

### 3.2 Confidential

| Table | Why confidential | Notes |
| --- | --- | --- |
| `driver_trip_location_updates` | Raw live location history | Retention-critical; downsample/delete per Phase 9. |
| `driver_trip_current_locations` | Live current bus location | Withheld when stale/invalid; never platform-admin readable. |
| `routes`, `route_stops`, `route_shapes`, `route_trip_patterns` | Route geometry, stops, schedules | Operational sensitivity; not platform-admin exposed. |
| `bus_route_assignments`, `driver_route_assignments`, `student_route_assignments` | Assignments | Tenant-scoped; auto-expire on assignment end. |
| `driver_trips` | Trip lifecycle and snapshots | Tenant-scoped operational record. |
| `student_trip_events` | Pickup/drop-off events | Treated as Confidential because it links students to trip events; minimal retention. |
| `guardian_notification_outbox` | Notification work items | Confidential; contains guardian/student/trip references. |
| `bus_run_dispatches` | Prepared bus runs | Operational; tenant-scoped. |

### 3.3 Internal

| Table | Why internal | Notes |
| --- | --- | --- |
| `tenants` | Tenant identity, status, timezone, subscription | Platform-admin sees a narrow subset only (name, identifier, status, onboarding state). |
| `schools` | Organizational units | Tenant-scoped; not platform-admin exposed beyond aggregates. |
| `profiles` | User accounts and roles | Platform-admin sees only onboarding status, not personal fields. |
| `buses` | Vehicle records | Tenant-scoped operational data. |
| `invitations` / onboarding state | Tenant-member onboarding | Platform-admin sees status, not personal data. |

### 3.4 Public

| Artifact | Notes |
| --- | --- |
| `README.md`, marketing pages (`LandingPage.tsx`) | No personal or operational data. |

> **Note on `audit_events` (Phase 2, not yet built):** when introduced it
> contains references to who/what/when/tenant/target/outcome. It is
> **Restricted** because it can indirectly identify individuals; it must not
> store secrets or unnecessary student data.

## 4. Handling rules by tier

### Restricted
- Row Level Security: **required**, with explicit positive policies only.
- Platform-admin access: **none** for personal/identity fields.
- Logging: **never** log raw values; log IDs and outcomes only.
- Retention: per Phase 3 retention schedule; default to shortest lawful period.
- Breach: triggers Phase 3 privacy-breach workflow.

### Confidential
- Row Level Security: **required**, tenant-scoped.
- Live-data tables: withhold stale/invalid coordinates at the RPC layer.
- Retention: raw location history downsampled/deleted on schedule (Phase 9).
- Platform-admin access: **none** to operational rows.

### Internal
- Access: authenticated tenant roles only; platform-admin narrow subset.
- Retention: operational need + legal hold.

### Public
- No access control.
- Must contain **no** personal or operational data.

## 5. Fields explicitly prohibited at every tier

Regardless of classification, these fields must not exist in any table, RPC
return, log, or message:

- Alberta Student Number / `asn` / `alberta_student_number`
- Student home address
- Student health data
- Custody narratives
- Driver license raw images (store verification status only)
- Guardian passwords or secrets
- Service-role keys in frontend/logs

## 6. Platform-admin control-plane surface (Phase 1 enforcement)

Platform administrators may read, through narrowly scoped control-plane
functions only, the following Internal-tier fields:

- `tenants.name`, `tenants.identifier`, `tenants.status`
- Initial tenant-admin onboarding status (derived, not raw profile rows)
- Subscription/service information
- Aggregate health and usage counts (no per-student/per-guardian breakdowns)

Everything else — students, guardians, drivers, manifests, routes, stops,
live locations, assignments — is **denied by default** and this document is
the authority for that denial.

## 7. Changes to this document

Reclassification requires a `decision-log.md` entry and a security review.
Adding a new table requires adding it here in the same PR.

---

**Sign-off**

| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Product Owner | _pending_ | | |
| Security Lead | _pending_ | | |
| Engineering Lead | _pending_ | | |
