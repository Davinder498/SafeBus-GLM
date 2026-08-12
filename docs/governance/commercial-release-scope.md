# SafeBus Alberta — Commercial Release 1 Scope

**Status:** Approved and locked

**Decision owner:** Platform Administrator

**Prepared:** 2026-08-12

**Approved:** 2026-08-12

**Decision record:** `DL-010`

## 1. Purpose

This document defines the product boundary for SafeBus Alberta Commercial
Release 1 (CR1). It distinguishes:

- what SafeBus is committing to provide;
- what must be proven before CR1 may handle real customer data;
- what is deliberately excluded from CR1; and
- the maximum size of the first controlled commercial pilot.

Code existing in the repository is not, by itself, approval to advertise or
operate a feature commercially. A committed capability may launch only after
its release gates are complete.

## 2. Product identity

SafeBus Alberta is a school transportation operations and live bus-visibility
platform. It is not a Student Information System and does not replace
PowerSchool, SchoolEngage, or another school-management platform.

The governing product rule is:

> Track the bus, not the child.

Live location belongs to a bus operating an authorized active trip. SafeBus
does not track a child, child-carried phone, badge, wearable, or personal GPS
device.

## 3. CR1 customer and geographic boundary

- Initial geography: Alberta, Canada.
- First customer type: Alberta public school authority.
- Other Alberta customer types require a later decision after legal-role and
  operating-model review.
- Production processing and backups require approved Canadian-region evidence.

## 4. CR1 committed capabilities

The following capabilities are in the CR1 product commitment. Inclusion here
does not waive the release gates in section 5.

| Area                    | CR1 commitment                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Tenant administration   | Tenant lifecycle and narrow platform control plane                                                                    |
| Schools                 | Transportation organizational-unit management                                                                         |
| Fleet                   | Bus and driver records and assignments                                                                                |
| Routes                  | Routes, stops, trip patterns, and versioned route geometry                                                            |
| Students and guardians  | Minimum transportation roster, guardian records, and authorized guardian-student links                                |
| Assignments             | Student, bus, route, stop, and driver transportation assignments                                                      |
| Trips                   | Start, pause, resume, complete, cancel, and operational exception workflows                                           |
| Driver operation        | Assigned-trip dashboard, active-trip manifest, manually recorded pickup/drop-off events, and trip history             |
| Bus tracking            | Bus location collection only during an authorized active trip, including secured offline recovery                     |
| Admin visibility        | Tenant-scoped active-trip and fleet monitoring                                                                        |
| Guardian visibility     | Linked-student authorization used only to reveal the assigned active bus and relevant route/trip state                |
| Import                  | Student-only CSV import; no general SIS or transportation-data import                                                 |
| Bus QR                  | Driver scan-to-start using a bus/session credential; never a student credential                                       |
| Notifications           | Guardian pickup/drop-off email only                                                                                   |
| Mobile                  | Managed Android driver application                                                                                    |
| Security and governance | Tenant isolation, least privilege, MFA for administrators, audit evidence, retention controls, and protected releases |

## 5. Required CR1 launch gates

These items are part of the commercial product promise but are not considered
production-ready until their named commercial-readiness point is completed and
approved:

| Gate                  | Required outcome                                                                           | Readiness point |
| --------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| Database contract     | Generated database types are current and used by application clients                       | Point 2         |
| Safe release          | All preflight checks pass before production schema mutation                                | Point 3         |
| Environment isolation | Separate approved DEV, staging, and production systems                                     | Point 4         |
| Authorization proof   | Hosted RLS execution and independent tenant/privacy-boundary review                        | Point 5         |
| Privacy and legal     | Approved PIA, legal role, retention, vendor, residency, and contractual controls           | Point 6         |
| Android reliability   | Signed build pipeline and real-device background-tracking evidence                         | Point 7         |
| Interactive maps      | Approved production map provider and safe degraded fallback                                | Point 8         |
| Operations            | Production monitoring, alerting, incident response, support, backup, and recovery evidence | Point 9         |
| Product verification  | Authenticated end-to-end, accessibility, resilience, and load evidence                     | Point 10        |
| Pilot authorization   | Signed pilot plan, entry/exit criteria, and rollback authority                             | Point 11        |

No real-data commercial launch is authorized merely because the capability
exists in source code.

## 6. Explicitly excluded from CR1

- Student QR badges or student boarding scans.
- Per-child GPS or any child-carried tracking device.
- SMS or push notifications.
- Traffic-aware or road-network ETA.
- PowerSchool, SchoolEngage, or other SIS integrations.
- CSV import beyond the approved student-only workflow.
- Guardian access to raw trip-location history or trip replay.
- Geofencing or automated route-deviation alerts.
- Speed enforcement or driver scoring.
- Driver payroll, HR, attendance, grades, fees, or other SIS functions.
- General school-parent messaging, announcements, or calendars.
- Placeholder Reports and Alerts products.
- Production operation outside Alberta.
- iOS driver support unless separately approved.

Placeholder navigation must not be presented as an available CR1 feature.

## 7. Prohibited data and visibility

SafeBus must never collect or store:

- Alberta Student Number (`asn` or `alberta_student_number`);
- student home address;
- student health or medical data;
- custody or family-court narratives;
- per-child location data; or
- unrelated student information exposed to a guardian.

Guardians may see only information authorized through active links to their
students. Drivers may see only operational information required for their
assigned work.

## 8. Platform administrator boundary

SafeBus platform administrators may manage tenant lifecycle, onboarding state,
subscription/service information, and aggregate system health. They may not
browse tenant students, guardians, drivers, manifests, routes, stops, trips, or
live locations.

## 9. First commercial pilot ceiling

CR1 begins as a controlled Alberta pilot with:

- one to three approved public-school-authority tenants;
- 25 to 100 buses total;
- explicitly selected schools, drivers, and guardians;
- synthetic staging validation before real data;
- high-touch support for at least 60 operating days; and
- immediate suspension and rollback authority.

The pilot ceiling is 100 buses. Expansion above 100 buses requires a new
decision supported by measured security, reliability, capacity, privacy, and
support evidence. The 20,000-bus figure remains a long-term architecture
target, not a commercial commitment.

## 10. Scope-change control

A CR1 scope change requires all of the following:

1. Explicit approval by the Final Decision Holder.
2. A new accepted entry in `decision-log.md`.
3. An updated feature inventory and risk assessment.
4. Security and privacy review proportional to the change.
5. Automated and manual acceptance evidence.
6. A named milestone implemented on a feature branch and approved through a
   pull request.

## 11. Approval

Approval of this document freezes the CR1 product boundary. It does not certify
that any launch gate in section 5 has passed.

| Role                  | Name                   | Date       | Decision            |
| --------------------- | ---------------------- | ---------- | ------------------- |
| Final Decision Holder | Platform Administrator | 2026-08-12 | Approved as written |
