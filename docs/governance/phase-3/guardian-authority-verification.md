# SafeBus Alberta — Phase 3 Guardian-Authority Verification

**Status:** Draft for counsel confirmation
**Owner:** Privacy Lead + Engineering Lead
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-08-07

---

## 1. Purpose

Phase 3 requires **guardian-authority verification without storing sensitive
custody narratives**. SafeBus must let a guardian see only the bus assigned
to a student they are authorized to view, and it must do so **without**
collecting family-court or custody details.

This document defines the verification model. It deliberately keeps the
authoritative decision **outside** SafeBus, with the customer.

## 2. Principle

> SafeBus does not decide who is a guardian. The customer (school
> authority) decides. SafeBus records only the resulting operational
> linkage and an attestation that the customer verified it.

This keeps custody, family-court, and guardianship narratives out of the
platform, consistent with [`../product-scope.md`](../product-scope.md) §2.1
and `AGENTS.md`.

## 3. Verification flow

1. The **customer** (school authority) verifies, through its own process,
   that a guardian is authorized to view the transportation information of
   a specific student. This may involve records the customer holds under
   the Education Act — records SafeBus never imports.
2. A **tenant administrator** establishes the guardian↔student link in
   SafeBus through the existing secure linking RPC (migration `0019`).
3. The linking RPC records **who** created the link, **when**, and the
   relationship type — **not** any custody narrative or evidence.
4. The link controls guardian visibility via RLS and the guardian RPCs
   (migrations `0015`, `0020`, `0024`, `0027`, `0061`). Removing the link
   revokes visibility immediately.

## 4. What SafeBus stores (and does not store) about authority

| Stored | Not stored |
| --- | --- |
| Guardian profile, student record, relationship type, link creator, link timestamp, active flag | Custody narratives |
| Audit event when the link is created or removed (`guardian.student_link_created` / `_removed`) | Family-court documents or outcomes |
| Notification consent flag (`can_receive_notifications`) | Reasons the customer approved or rejected a guardian |
| | Health, custody, or sensitive family information |

## 5. Re-verification and revocation

- The customer may re-verify or revoke authority at any time through its
  own process and instruct the tenant administrator to remove the link.
- Link removal is immediate and is recorded in the audit trail.
- SafeBus never "auto-restores" a removed link; re-establishing one
  requires a new tenant-admin action and a new audit event.

## 6. Disputes

If two guardians dispute authority over a student, SafeBus follows the
customer's instruction. SafeBus does not adjudicate; it records the
customer's decision and the audit trail of the link change. Any
statement-of-disagreement process is handled per
[`access-and-correction.md`](./access-and-correction.md) §6.

## 7. Engineering controls

- Guardian RPCs derive scope from `auth.uid()` and the active
  `student_guardians` link — no guardian-supplied identifier authorizes
  access.
- RLS denies guardians any direct table access; all reads go through
  SECURITY DEFINER RPCs that re-check the active link.
- Regression coverage: `tests/rls/guardian-linking-rls.sql`,
  `tests/rls/guardian-visibility-rls.sql`, and the guardian event/location
  suites enforce that only linked, active, same-tenant guardians see data.

## 8. Counsel confirmation items

- [ ] Confirm that keeping the authority decision with the customer
  (and recording only an attestation) satisfies the applicable statute(s).
- [ ] Confirm the relationship-type values the customer may record.
- [ ] Confirm the dispute-handling model in §6.