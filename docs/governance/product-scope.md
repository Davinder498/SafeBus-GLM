# SafeBus Alberta — Product Scope

**Status:** Approved and locked for Commercial Release 1
**Owner:** Product Owner
**Phase:** 0 — Product and governance baseline
**Last updated:** 2026-08-12

---

## 1. What SafeBus is

SafeBus Alberta is a **school transportation operations and live bus
visibility platform** for Alberta schools, transportation authorities, and the
guardians of transported students.

SafeBus is **not** a Student Information System (SIS). SafeBus is **not** a
PowerSchool or SchoolEngage replacement. SafeBus is **not** a full school
management system.

SafeBus sits alongside an authority's existing SIS and handles only the
transportation operations layer: buses, drivers, routes, stops, assignments,
trips, live bus location, and narrow guardian-facing visibility.

## 2. Enforceable architectural rule

> **Track the bus, not the child.**

This is not a slogan. It is an enforceable rule that governs every design
decision:

- The unit of live tracking is the **bus**, attached to an authorized active
  trip.
- Guardians see the **bus assigned to their linked student's active trip** —
  not the child, not a phone, not a wearable, not a per-child GPS device.
- Live location is collected **only during an authorized active trip** and
  stops when the trip ends.
- Driver manifests expose the **minimum** student information required to
  operate the trip safely — nothing more.
- Any feature that would track a child directly, store prohibited student
  attributes, or expose non-linked students is out of scope by definition.

### 2.1 Prohibited data (never collected, never stored)

These are excluded by this scope document and by `AGENTS.md`. Adding any of
them requires a formal scope change through the decision log, not a code
change:

- Alberta Student Number, `asn`, or `alberta_student_number`
- Student home address
- Student health data
- Custody narratives or sensitive family-court information
- Full student lists shown to guardians
- Per-child GPS / child-carried tracking devices

### 2.2 In-scope operational data

- Tenant (school authority / operator) identity and administrative settings
- Schools (as transportation organizational units)
- Buses and vehicle records
- Drivers and their assignments
- Routes, stops, schedules, service days
- Student ↔ stop/route assignments (transportation linkage only)
- Guardian ↔ student links (authority to view the assigned bus)
- Trips and trip lifecycle (start, pause, complete, cancel, exception)
- Live bus location during an active trip
- Operational notes in controlled formats (no free-text prohibited data)

## 3. Functional boundary — current vs. future

The authoritative list lives in
[`feature-inventory.md`](./feature-inventory.md). This section states the
principle: **future functionality is not current functionality**. Features
such as ETA, route lines, traffic, notifications, SMS, QR codes, student
badges, pickup/drop-off scan events, CSV import beyond the approved
student-only workflow, live GPS beyond active trips, maps APIs, and SIS
integrations are **future scope** unless and until a specific milestone in
this plan explicitly approves them.

A feature existing in the codebase does **not** make it current scope. The
feature inventory reconciles code-state drift against approved scope.

The proposed first commercial commitment and the production gates that must
be satisfied before it may handle real customer data are defined separately in
[`commercial-release-scope.md`](./commercial-release-scope.md). This permanent
product boundary and the CR1 release boundary must both be satisfied.

## 4. Customer types (definition only — first customer picked separately)

SafeBus is designed to serve these Alberta customer types. The first-customer
profile is chosen in
[`first-customer-profile.md`](./first-customer-profile.md).

1. **Public school authority** — a public school division or district
   operating transportation under the School Act / Education Act.
2. **Charter school** — an Alberta charter school authority.
3. **Private school** — an accredited Alberta private school operator.
4. **Transportation contractor** — a contracted operator running
   transportation on behalf of one of the above.

All four share the same multi-tenant platform model. Customer type affects
legal role (see Phase 3) and onboarding flow, not the core authorization
model.

## 5. Geographic and jurisdictional boundary

- Initially **Alberta, Canada only**.
- Privacy analysis must align with **POPA, ATIA, and PIPA** (the FOIP
  references currently in `README.md` are obsolete and must be corrected in
  Phase 3).
- Production data processing pinned to Canadian regions (ca-central-1)
  subject to Phase 3 contractual verification.

## 6. Capacity commitment

SafeBus is **architected for the worst case of 20,000 simultaneously
reporting buses**, while **commercial commitments remain staged** through
Phase 12 (Stage A → Stage D). See
[`capacity-assumptions.md`](./capacity-assumptions.md) for the precise
definition of "500,000 users" and the per-stage bus ceilings.

## 7. Platform isolation rule (governs Phase 1)

Platform (SafeBus-host-side) administrators are **not** tenant operators.
They may see only:

- Tenant name and identifier
- Tenant status
- Initial tenant-admin onboarding status
- Subscription/service information
- Aggregate health and usage counts

They must **never** see students, guardians, drivers, manifests, routes,
stops, or live locations through platform functions. This rule is
implemented in Phase 1 and verified by the RLS test suite.

## 8. What is explicitly out of scope for SafeBus the product

- Replacing or duplicating an SIS
- Attendance, grades, enrollment, fees, report cards
- Specialized busing eligibility determinations that require health or
  custody data
- Vehicle telemetry beyond operational location/speed
- Driver HR / payroll
- General-purpose parent-school communication (announcements, messaging,
  calendars)

## 9. Changes to this document

This scope is frozen at Phase 0 sign-off. Any change requires:

1. A new entry in [`decision-log.md`](./decision-log.md) with rationale.
2. Updated `feature-inventory.md` and `risk-register.md` entries.
3. Re-affirmation that the change does not violate "track the bus, not the
   child" or the platform-isolation rule, or an explicit, recorded exception.

---

**Sign-off**

| Role                  | Name                   | Date       | Signature               |
| --------------------- | ---------------------- | ---------- | ----------------------- |
| Final Decision Holder | Platform Administrator | 2026-08-12 | Approved through DL-010 |
