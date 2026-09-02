# SafeBus Alberta — Phase 3 Privacy Impact Assessment (Draft)

**Status:** Draft for the appropriate approving authority — not approved
**Owner:** Privacy Lead
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-09-02

---

## 1. Purpose

A Privacy Impact Assessment (PIA) is a Phase 3 exit-gate requirement. This
document is the structured engineering draft that counsel and the privacy
professional complete and approve. It draws on:

- [`legal-role-analysis.md`](./legal-role-analysis.md) — statutory framework.
- [`data-inventory-and-flow.md`](./data-inventory-and-flow.md) — what is collected and why.
- [`retention-schedule.md`](./retention-schedule.md) — how long data is kept.
- [`../data-classification.md`](../data-classification.md) — sensitivity tiers.
- [`../risk-register.md`](../risk-register.md) — privacy and security risks.

## 2. Project description

SafeBus Alberta is a school transportation operations and live bus
visibility platform. It is **not** an SIS. The architectural rule is
"track the bus, not the child": the unit of live tracking is the **bus**
attached to an authorized active trip. Personal information is collected
only to operate transportation and to give guardians narrow visibility of
the bus assigned to their linked student.

## 3. Legal role and authority

Per [`legal-role-analysis.md`](./legal-role-analysis.md) §4, the working
assumption is that SafeBus acts as a **contracted operator / service
provider on behalf of a public body** for the first customer. This section
is finalized when counsel confirms the role under POPA/ATIA/PIPA and the
Education Act.

| Customer type             | Draft role                                         | Statute(s)                  | Status          |
| ------------------------- | -------------------------------------------------- | --------------------------- | --------------- |
| Public school authority   | Contracted operator on behalf of a public body     | POPA / ATIA / Education Act | Pending counsel |
| Charter school            | Public-body/service-provider model to be confirmed | POPA / ATIA                 | Pending counsel |
| Private school            | To be confirmed                                    | PIPA                        | Pending counsel |
| Transportation contractor | Service provider to an organization                | PIPA                        | Pending counsel |

## 4. Information collected, used, and disclosed

See [`data-inventory-and-flow.md`](./data-inventory-and-flow.md) §3 for the
field-level inventory, draft lawful basis, recipients, and retention. This
PIA incorporates that inventory by reference.

**Collect, use, disclose principles applied:**

- **Collection limitation** — only the fields in the inventory; no ASN, no
  home address, no health data, no custody narratives.
- **Purpose limitation** — transportation operations and guardian bus
  visibility only; no secondary use.
- **Use limitation** — data is used only for the purpose for which it was
  collected.
- **Disclosure limitation** — disclosed only to named subprocessors
  ([`subprocessors.md`](./subprocessors.md)) and authorized tenant roles.
- **Minimal manifest** — drivers see the minimum student information needed
  to operate the trip.

## 5. Privacy risks and mitigations

| Risk                                          | Source       | Mitigation                                                                                                                 | Status                                         |
| --------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Guardian cross-tenant/cross-student leak      | R-015        | RLS on every sensitive table; guardian RPCs derive scope from `auth.uid()`; regression tests in `tests/rls/guardian-*.sql` | Monitored — Phase 1                            |
| Platform admin sees personal/operational data | R-003        | Platform-isolation rule; narrow control-plane RPCs; `tests/rls/phase1-platform-isolation-rls.sql`                          | Open — Phase 1 execution                       |
| Driver over-authorization                     | R-004        | Assignment-derived driver policies; `tests/rls/phase1-driver-authorization-rls.sql`                                        | Open — Phase 1 execution                       |
| Live location leaks beyond active trip        | R-010, R-015 | Location collected only during active trip; stale/invalid withheld at RPC layer; raw history retention-limited             | Mitigated; retention enforced by `0069`        |
| No retention/deletion automation              | R-011        | Migration `0069`, dry-run scheduler, and `tests/rls/phase3-retention-rls.sql`                                              | Implemented in repo; DEV/counsel gates pending |
| Obsolete FOIP framing                         | R-006        | Replaced with sourced POPA/ATIA/PIPA draft analysis; `README.md` corrected                                                 | Drafted; counsel determination pending         |
| Account recovery / MFA weakness               | R-007        | MFA enforcement helpers; recent-auth gates (migration `0067`)                                                              | Implemented — Phase 2                          |
| No audit trail for sensitive actions          | R-008        | Append-only `audit_events`; RPC-only writes (migration `0066`)                                                             | Implemented — Phase 2                          |
| Custody narratives collected                  | Scope rule   | Prohibited; guardian authority verified operationally                                                                      | N/A — prohibited                               |

## 6. Retention and deletion

[`retention-schedule.md`](./retention-schedule.md) defines the maximum
retention per data class and the automated deletion/anonymization enforced
by migration `0069`. Counsel confirms the periods satisfy the applicable
statute(s) and the Education Act.

## 7. Access and correction

Individuals exercise access and correction rights through the procedure in
[`access-and-correction.md`](./access-and-correction.md). The system
supports the workflow through tenant-scoped admin action and audit
recording; no new public API exposes personal data.

## 8. Breach response

[`breach-response.md`](./breach-response.md) defines breach assessment,
containment, notification thresholds, and the post-incident review. A
tabletop exercise is a Phase 3 exit-gate requirement.

## 9. Subprocessors and cross-border transfers

Production personal data is processed and stored in **ca-central-1**. No
cross-border transfer of personal data occurs except as approved by counsel
and recorded in [`subprocessors.md`](./subprocessors.md). Geoapify map tile
requests contain viewport tile coordinates, device IP, origin/referrer, and
normal request metadata but no SafeBus account, student, guardian, driver, bus,
trip, or tenant identifier. Counsel must determine the legal/privacy treatment
of this metadata and any cross-border processing before approval. Opt-in
Android push additionally sends an FCM registration token, a generic or
event-type-only notification, device IP address, and ordinary delivery metadata
to Google Firebase Cloud Messaging. Push remains tenant-gated off until the FCM
subprocessor and any cross-border processing are approved.

## 10. Open items for the approving authority

- [ ] Confirm SafeBus legal role per customer type (§3).
- [ ] Approve retention periods (§6).
- [ ] Approve the subprocessor list and any cross-border flows (§9).
- [ ] Approve the access-and-correction procedure (§7).
- [ ] Approve the breach-response procedure (§8).
- [ ] Confirm the PIA as a whole and record sign-off in
  [`../decision-log.md`](../decision-log.md).

## 11. Approval

| Role                           | Name      | Date | Decision |
| ------------------------------ | --------- | ---- | -------- |
| Privacy Lead                   | _pending_ |      |          |
| Privacy professional / counsel | _pending_ |      |          |
| Product Owner                  | _pending_ |      |          |
