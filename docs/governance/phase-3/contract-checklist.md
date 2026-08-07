# SafeBus Alberta — Phase 3 Customer Contract Pack Checklist

**Status:** Draft for counsel drafting and approval
**Owner:** Counsel + Product Owner
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-08-07

---

## 1. Purpose

Phase 3 requires a customer contract pack that includes the agreements and
terms below. This checklist tracks the drafting, review, and approval of
each document. The actual executed agreements live outside the codebase;
this file is the source-of-truth register.

## 2. Required documents

| Document | Purpose | Drafted | Counsel review | Approved | Notes |
| --- | --- | --- | --- | --- | --- |
| **Master Services Agreement (MSA)** | Primary commercial contract with the customer | [ ] | [ ] | [ ] | Defines services, fees, term, termination |
| **Data Processing Agreement (DPA)** | Privacy/data terms flowing down POPA/ATIA/PIPA + Education Act | [ ] | [ ] | [ ] | Roles, purposes, subprocessors, retention, breach, deletion |
| **Security Schedule** | Security obligations of both parties | [ ] | [ ] | [ ] | Encryption, access control, MFA, audit, incident response |
| **Service-Level Agreement (SLA)** | Availability and support commitments | [ ] | [ ] | [ ] | Uptime, support tiers, escalation; staged per `capacity-assumptions.md` |
| **Acceptable-Use Terms (AUP)** | Permitted/prohibited uses of the platform | [ ] | [ ] | [ ] | No secondary use, no ASN collection, no RLS bypass |
| **Privacy Policy** | Public privacy statement | [ ] | [ ] | [ ] | Derived from PIA + notices; published externally |
| **Data-Return and Destruction Terms** | What happens to personal data at termination | [ ] | [ ] | [ ] | Return window, deletion confirmation, backup handling |

## 3. Minimum content the DPA must carry

The DPA is the core privacy contract. It must, at minimum:

1. Identify each party's role (SafeBus as service provider/contracted
   operator; customer as the responsible public body/organization).
2. Define the purposes and categories of personal information SafeBus
   processes on the customer's instructions (cross-reference
   [`data-inventory-and-flow.md`](./data-inventory-and-flow.md)).
3. List approved subprocessors ([`subprocessors.md`](./subprocessors.md))
   and the mechanism for adding new ones with customer notice.
4. Incorporporate the retention schedule
   ([`retention-schedule.md`](./retention-schedule.md)) and the deletion
   controls.
5. Allocate breach-notification obligations
   ([`breach-response.md`](./breach-response.md)).
6. Require Canadian processing (ca-central-1) and define any approved
   cross-border exceptions.
7. Address data return and destruction at termination.
8. Address audit/right-to-inspect and records.
9. Flow down the Education Act constraints for student-record information.

## 4. Review process

1. Counsel drafts each document using the PIA and this checklist.
2. Privacy professional reviews against the PIA and retention schedule.
3. Product Owner reviews commercial terms.
4. Customer negotiates and signs.
5. The signed pack is referenced in `decision-log.md`; executed copies live
   outside the codebase.

## 5. Changes after signing

Any material change to a signed agreement requires a `decision-log.md`
entry and, if it affects privacy, a PIA update and re-review.

## 6. Out of scope for this checklist

- Negotiating commercial pricing (Product Owner, outside this file).
- Operational contract storage (outside the codebase).