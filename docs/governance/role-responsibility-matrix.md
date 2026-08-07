# SafeBus Alberta — Role and Responsibility Matrix

**Status:** Draft — awaiting product-owner and security sign-off
**Owner:** Product Owner
**Phase:** 0 — Product and governance baseline
**Last updated:** 2026-08-06

---

## 1. Purpose

Phase 0 requires a **signed role and responsibility matrix** that designates
data owners and system owners. This document defines both the **product
roles** (who does what in SafeBus operations) and the **delivery roles** (who
builds, reviews, approves). It is referenced by the RLS test matrix in
Phase 1 and the audit design in Phase 2.

## 2. Product roles (data-access tiers)

These map directly to the roles enforced by `current_user_role()` and RLS.

| Role | Scope | Can see | Cannot see |
| --- | --- | --- | --- |
| **Platform Super Admin** | SafeBus-host side; not a tenant operator | Tenant name/identifier, tenant status, initial admin onboarding status, subscription info, aggregate health/usage counts | Students, guardians, drivers, manifests, routes, stops, live locations, invitation personal data |
| **Tenant Administrator** | Own tenant only | Everything within their tenant | Other tenants; platform control plane |
| **School Administrator** | Own school(s) within tenant | School-scoped students, guardians, routes, assignments | Other schools' operational data; tenant-wide admin actions |
| **Transportation Administrator** | Own tenant operations | Buses, drivers, routes, assignments, trips, live fleet | Other tenants; student personal data beyond operational need |
| **Driver** | Own active trip only | Assigned bus, assigned route, active-trip minimum manifest | Other trips, other drivers' manifests, guardian contact data, tenant-wide data |
| **Guardian** | Linked students only | The bus assigned to their linked student's active trip; linked student's route info | Other students, other guardians, full manifests, driver identity, other stops |
| **Anonymous / unauthenticated** | None | Public marketing only | Any operational or personal data |

## 3. Substitute and emergency access (Phase 1 detail)

- **Substitute driver:** access is **assignment-derived**. A substitute gets
  the assigned bus/route/trip only for the duration of the active assignment
  and loses access automatically when it ends. No standing access.
- **Replacement bus:** access is **session-derived** and short-lived
  (`bus_tracking_sessions`).
- **Revoked / suspended users:** access is lost immediately on
  suspension/revocation, verified by Phase 1 RLS tests.

## 4. Delivery roles (build / review / approve)

| Role | Responsibility | Rotation / backup |
| --- | --- | --- |
| **Product Owner** | Owns scope, signs Phase 0 documents, approves milestones, approves first customer | Named backup required |
| **Engineering Lead (GLM builds)** | Implements milestones one at a time on feature branches | At least two engineers aware of any given area |
| **Reviewer (Codex reviews)** | Independent automated + human review of PRs; cannot merge | Independent of the author |
| **Human Approver** | Final merge approval to `main`; never GLM alone | Named product owner or delegate |
| **Security Lead** | Owns RLS matrix, data classification, incident response | Named backup required |
| **Privacy Lead / Counsel** | Owns PIA, retention, breach workflow (Phase 3) | External counsel engaged |
| **SRE / On-call** | Monitoring, paging, rollback (Phase 10) | Defined escalation rotation |

## 5. Data owners

| Data domain | Owner | Backup |
| --- | --- | --- |
| Student identity & guardian links | Tenant Administrator (ops) + Privacy Lead (policy) | School Administrator |
| Driver records & licensing attributes | Transportation Administrator | Tenant Administrator |
| Live location + routes + assignments | Transportation Administrator | Tenant Administrator |
| Tenant settings & operational metrics | Tenant Administrator | — |
| Platform control plane (tenant status, onboarding, subscription) | Platform Super Admin | Product Owner |
| Audit records | Security Lead | Privacy Lead |
| Marketing / public content | Product Owner | — |

## 6. System owners

| System / component | Owner |
| --- | --- |
| Supabase project (DB, Auth, RLS, migrations) | Engineering Lead |
| Web app (`apps/web`) | Engineering Lead |
| Driver mobile app (`apps/mobile`) | Engineering Lead |
| Netlify functions + deployment | Engineering Lead |
| CI / secure pipeline (Phase 4) | Engineering Lead |
| Monitoring / incident response (Phase 10) | SRE / On-call |
| Privacy program + subprocessor list (Phase 3) | Privacy Lead / Counsel |

## 7. Separation of duties (enforced)

- The person who **builds** a change is not the only person who **reviews**
  it, and is never the person who **approves the merge**.
- GLM may build; Codex reviews; a human approves final merge to `main`.
- No direct changes to `main`. Feature branches only.
- One milestone at a time.

## 8. Changes to this document

Role or ownership changes require a `decision-log.md` entry and, for
data-access tiers, an accompanying RLS test update.

---

**Sign-off**

| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Product Owner | _pending_ | | |
| Security Lead | _pending_ | | |
| Engineering Lead | _pending_ | | |