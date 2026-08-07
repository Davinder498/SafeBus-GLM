# SafeBus Alberta — Phase 3 Access and Correction Procedure

**Status:** Draft for counsel confirmation
**Owner:** Privacy Lead
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-08-07

---

## 1. Purpose

Individuals have rights to access and correct their personal information
under Alberta law. This procedure defines how SafeBus honors those rights
while protecting other people's data and the platform's tenant isolation.

## 2. Who can make a request

- **Guardians** — about their own personal information.
- **Drivers** — about their own personal information.
- **Students / independent students** — see [`student-processes.md`](./student-processes.md).
- **Tenant administrators** — about their own account information.
- **Authorized representatives** — with verifiable written authority
  (guardian-authority verification, not custody narratives — see
  [`guardian-authority-verification.md`](./guardian-authority-verification.md)).

## 3. How to submit a request

Requests are submitted to the tenant administrator first (the customer is
the responsible party for their transportation data). If the tenant cannot
resolve the request, it escalates to SafeBus through the support channel
defined in the customer agreement and the privacy notice.

Required information:

- Identity verification (account email + a second factor).
- The personal information at issue.
- The correction requested, or the scope of access requested.

## 4. Handling timeline (draft — counsel confirms)

| Step | Target (draft) | Owner |
| --- | --- | --- |
| Acknowledge request | 5 business days | Tenant Admin / Privacy Lead |
| Fulfill access request | 30 days | Tenant Admin |
| Fulfill correction request | 30 days | Tenant Admin |
| Escalation to SafeBus | 15 days after tenant non-resolution | Privacy Lead |
| Record outcome in audit trail | Same day as action | System (audit event) |

## 5. What access includes

An access response discloses the personal information SafeBus holds about
the requester, subject to:

- **Tenant isolation** — no data from other tenants.
- **Third-party protection** — information that would identify another
  student/guardian/driver is withheld or anonymized.
- **Scope** — limited to the requester's own information, not operational
  data about other people on the same route.

## 6. Corrections

Corrections are made through tenant-scoped admin action. If SafeBus and
the tenant disagree about a correction, the requester is told that a
statement of disagreement may be attached, and the process follows the
applicable statute.

Every correction writes an audit event (`student.record_accessed` style
outcome or a dedicated correction event agreed with counsel).

## 7. What SafeBus will not do

- **No bulk export to guardians.** Access is individual-scoped.
- **No custody-narrative collection.** Guardian authority is verified
  operationally, not by storing sensitive family-court details.
- **No bypass of RLS.** All access goes through the same authorized paths
  used by the live application.

## 8. Records

Each request and its outcome is recorded. The audit trail shows who acted,
when, what was disclosed/corrected, and the outcome, without storing the
personal data itself in the audit row.

## 9. Counsel confirmation items

- [ ] Confirm the timelines in §4 satisfy the applicable statute(s).
- [ ] Confirm the statement-of-disagreement mechanism in §6.
- [ ] Confirm guardian-authority verification approach
  ([`guardian-authority-verification.md`](./guardian-authority-verification.md)).