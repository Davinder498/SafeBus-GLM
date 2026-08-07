# SafeBus Alberta — First-Customer Profile

**Status:** Draft — awaiting product-owner sign-off
**Owner:** Product Owner
**Phase:** 0 — Product and governance baseline
**Last updated:** 2026-08-06

---

## 1. Purpose

Phase 0 requires an **approved first-customer profile**. SafeBus can serve
four customer types (see [`product-scope.md`](./product-scope.md) §4). This
document picks the first one and states why, so Phases 1–11 validate against
a realistic customer rather than a generic one.

## 2. Candidate customer types

1. Public school authority
2. Charter school
3. Private school
4. Transportation contractor

## 3. Recommended first customer

**Public school authority** (a public school division/district operating
transportation under the School Act / Education Act).

### 3.1 Why this is the right first customer

- **Volume profile matches the platform design:** public authorities operate
  the largest bus fleets in Alberta, which exercises the "track the bus, not
  the child" model and the 20,000-bus worst-case architecture most
  meaningfully.
- **Stakeholder clarity:** one authority, many schools, many guardians — the
  exact multi-tenant model already built.
- **Privacy-regulation alignment:** public authorities are the cleanest fit
  for the POPA/ATIA analysis Phase 3 must complete (public-body data handled
  by a contracted operator).
- **Operational realism:** public authorities already run paper/radio-based
  late-bus workflows that SafeBus replaces with operational + guardian
  visibility — clear value, measurable pilot metrics.

## 4. First-customer pilot envelope (refined in Phase 11)

| Attribute | Target |
| --- | --- |
| Customer type | Public school authority |
| Tenants in pilot | 1–3 |
| Buses in pilot | 25–100 |
| Schools | Limited |
| Guardians/drivers | Explicitly selected, written pilot agreement |
| Duration | Defined start and end with immediate rollback capability |

> This profile is the input to Phase 11 (Controlled Alberta Pilot). It is
> **not** authorization for 20,000-bus launch. Stage A–D commercial ceilings
> remain governed by [`capacity-assumptions.md`](./capacity-assumptions.md).

## 5. Why the other three types are not first

- **Charter / Private school:** smaller fleets, different legal posture
  (PIPA for private organizations). Valid customers, but they under-exercise
  the scale architecture in pilot.
- **Transportation contractor:** a contractor runs buses *on behalf of* a
  public authority, so the public-authority relationship must be solved
  first; the contractor role flows from it (Phase 3 legal-role analysis).

## 6. Legal-role implication for Phase 3

For a public-authority first customer, SafeBus is most likely acting as a
**contracted operator / service provider on behalf of a public body**, which
shapes the POPA/ATIA analysis. This is finalized by counsel in Phase 3, not
by this document.

## 7. Changes to this document

Changing the first customer requires a `decision-log.md` entry and revisiting
the capacity assumptions and Phase 3 privacy analysis.

---

**Sign-off**

| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Product Owner | _pending_ | | |
| Engineering Lead | _pending_ | | |