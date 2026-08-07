# SafeBus Alberta — Phase 3 Legal-Role and Statutory Analysis

**Status:** Draft for Alberta privacy counsel — not a legal determination
**Owner:** Privacy Lead / Counsel
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-08-07

---

## 1. Purpose

This document replaces the obsolete **FOIP** references identified in
[`../risk-register.md`](../risk-register.md) R-006 and supplies the
statutory framework that the PIA, retention schedule, access/correction
procedures, breach workflow, and contract pack depend on.

It is written by engineering as **evidence and a draft analysis**. The
legal conclusions ("SafeBus acts as X") must be confirmed by Alberta
privacy counsel before they are relied upon.

## 2. Statutes in scope

SafeBus operates in Alberta and processes personal information about
students, guardians, drivers, and administrative users. The statutes that
counsel must map SafeBus against are:

| Statute | Scope | Why it may apply to SafeBus |
| --- | --- | --- |
| **POPA** — protection-of-privacy principles under Alberta's public-sector privacy regime | Public bodies and their service providers | When a customer is a public school authority, SafeBus may handle personal information on behalf of a public body. |
| **ATIA** — access-to-information principles under Alberta's public-sector regime | Public bodies | Drives access, correction, and records-handling obligations that flow down to service providers by contract. |
| **PIPA** — Personal Information Protection Act | Private organizations and their service providers | When a customer is a private school or private transportation contractor, SafeBus may be subject to or acting under PIPA. |
| **Education Act** — student records | Schools and those handling student-record information | Constrains what student data may be collected, retained, and disclosed; reinforces the prohibition on ASN and the minimal-manifest rule. |
| **Canada — PIPEDA** and provincial private-sector law interplay | Organizations that handle personal information in commercial activity | Counsel determines whether PIPEDA or PIPA governs a given customer relationship. |

> The earlier `README.md` reference to **FOIP** is **obsolete** for
> SafeBus. FOIP is no longer the correct shorthand for SafeBus's analysis
> and is removed from this repository's user-facing privacy statements.

Authoritative starting points for counsel are the Alberta OIPC's
[public-sector access-law overview](https://oipc.ab.ca/resource/access-to-information-laws-in-alberta/),
the Alberta government's [PIPA overview](https://www.alberta.ca/personal-information-protection-act),
the OIPC's [POPA service-provider guidance](https://oipc.ab.ca/resource/popa-guidance-service-providers/),
and the OIPC's [POPA PIA guide](https://oipc.ab.ca/resource/popa-pia-template-completion-guide/).
The OIPC identifies school boards and charter schools as public bodies under
ATIA; private-school status must be assessed separately for each customer.

## 3. SafeBus legal role — candidate models

SafeBus's role depends on the **customer type** (see
[`../first-customer-profile.md`](../first-customer-profile.md) and
[`../product-scope.md`](../product-scope.md) §4). Counsel must confirm one
of the following for each customer relationship:

### 3.1 Service provider / processor

SafeBus processes personal information **on behalf of** a customer (the
controller/organization) and **on the customer's documented instructions**.
Indicators:

- SafeBus collects only the data the customer's transportation operations
  require.
- SafeBus does not use the data for its own unrelated commercial purposes.
- SafeBus's product scope (`../product-scope.md`) is fixed and narrow.
- Retention, access, and deletion are governed by contract and this PIA.

### 3.2 Organization subject to PIPA

If SafeBus is determined to collect, use, or disclose personal information
for its **own commercial purposes** (e.g., product analytics, cross-customer
benchmarking), it may be an **organization** under PIPA with its own
obligations, including a published privacy policy and consent management.

### 3.3 Contracted operator on behalf of a public body

Where the customer is a **public school authority**, SafeBus is expected to
be a **contracted operator / service provider** handling personal
information **on behalf of a public body**. This is the model the
[`first-customer-profile.md`](../first-customer-profile.md) anticipates and
the one the capacity assumptions and pilot envelope are built around.

## 4. Working assumption (for the PIA draft)

For the **first customer** (an Alberta public school authority), the
working assumption is:

> SafeBus acts as a **contracted operator / service provider on behalf of a
> public body**. SafeBus collects, uses, and discloses personal information
> only as necessary to provide the transportation-operations and live
> bus-visibility service, on the customer's instructions, under a written
> agreement that flows down POPA/ATIA/Education Act obligations.

**This is not a legal determination.** It is the basis on which the PIA,
retention schedule, and contract pack are drafted until counsel confirms or
replaces it.

## 5. Consequences for the system

Whichever role counsel confirms, the engineering controls must support all
candidate models so the platform is safe under any of them. That means:

1. **No secondary use.** The system does not perform analytics, advertising,
   or cross-tenant profiling on personal data. (Reinforced by RLS tenant
   isolation and platform-isolation rules.)
2. **Instruction-bound data collection.** Only the fields in
   [`data-inventory-and-flow.md`](./data-inventory-and-flow.md) §3 are
   collected, each with a documented business purpose and legal basis.
3. **Retention limits.** [`retention-schedule.md`](./retention-schedule.md)
   defines the maximum retention per data class, enforced by migration
   `0069` automated deletion.
4. **Access and correction.** [`access-and-correction.md`](./access-and-correction.md)
   defines the procedure individuals use to exercise rights.
5. **Subprocessor control.** [`subprocessors.md`](./subprocessors.md)
   names every vendor that touches personal data and tracks the contract
   status.
6. **Canadian processing.** Production personal data stays in ca-central-1
   unless counsel approves an exception.

## 6. Items requiring counsel confirmation

- [ ] Confirm POPA/ATIA applies (vs. PIPA) for the public-authority customer
  and define SafeBus's exact obligations as a contracted operator.
- [ ] Confirm whether SafeBus is ever a PIPA "organization" for any data
  flow (e.g., support metadata, billing).
- [ ] Confirm the lawful basis for each collected field in
  [`data-inventory-and-flow.md`](./data-inventory-and-flow.md) §3.
- [ ] Confirm retention periods in
  [`retention-schedule.md`](./retention-schedule.md) satisfy the relevant
  statute(s) and the Education Act.
- [ ] Confirm the breach-notification thresholds and timelines in
  [`breach-response.md`](./breach-response.md).
- [ ] Confirm the access-and-correction workflow satisfies ATIA-style and
  PIPA-style rights.
- [ ] Approve the customer contract pack (MSA, DPA, SLA, AUP, privacy
  policy) listed in [`contract-checklist.md`](./contract-checklist.md).

## 7. Sign-off

| Role | Name | Date | Notes |
| --- | --- | --- | --- |
| Privacy Lead / Counsel | _pending_ | | Legal-role determination recorded in `decision-log.md` |
