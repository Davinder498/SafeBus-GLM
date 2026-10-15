# SafeBus Alberta — Phase 3: Alberta Privacy and Legal Readiness

**Status:** Prepared for accountable privacy review; final evidence/approval pending
**Owner:** Business owner / Privacy Lead; specialist assistance when needed
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-10-15

Current work: [legal/privacy implementation and closure evidence](legal-privacy-completion-2026-10-15.md),
including accessible tenant, guardian and driver notices, the owner's Privacy
Lead appointment, sourced requirements/vendor review and observed retention
failures. Identity/contact and final readiness remain unresolved.

---

## 1. Purpose

Phase 3 establishes **lawful, documented handling** of student, guardian,
driver, and location information under Alberta law. It is owned by the
**Business Privacy Lead**, with specialist advice where needed. Engineering supplies evidence
(describing what the system collects, why, where it is stored, how it is
protected, and how it is deleted); engineering does **not** make legal
determinations alone.

This phase closes the two Phase-3-tracked risks in
[`../risk-register.md`](../risk-register.md):

- **R-006** — Obsolete FOIP references; correct POPA/ATIA/PIPA analysis not done.
- **R-011** — No retention/deletion automation for location history,
  invitations, trip records, audit records, and notifications.

## 2. Workstreams

Point 6 work resumed on 2026-10-13. The owner subsequently requested the business
privacy documents, commercial terms and PIA draft before counsel appointment or
customer selection. Start with the [business pack](business-pack/README.md),
[owner decisions](business-pack/owner-decisions.md) and updated
[PIA](privacy-impact-assessment.md). Legal decisions, customer authority,
operational evidence and launch approval remain pending. The
[Point 6 plan](../point-6-privacy-readiness.md#sequential-work-starting-2026-10-13)
distinguishes draft preparation from later approval. No general statutory
lawyer-appointment obligation is claimed. DL-023 replaces the blanket internal
counsel signature with sourced requirements evidence and excludes recovery drills.
Customer agreements/authority/PIA applicability are checked during activation;
they are separate from ownership of SafeBus. Review owners may seek specialist
advice where the particular law, uncertainty or contract calls for it.

| #   | Workstream                                              | Lead                           | Document                                                                                                                                               |
| --- | ------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Statutory mapping (FOIP → POPA/ATIA/PIPA)               | Privacy Lead; advice as needed | [`legal-role-analysis.md`](./legal-role-analysis.md)                                                                                                   |
| 2   | SafeBus legal role per customer type                    | Privacy Lead; advice as needed | [`legal-role-analysis.md`](./legal-role-analysis.md)                                                                                                   |
| 3   | Privacy Impact Assessment (PIA)                         | Privacy Lead                   | [`privacy-impact-assessment.md`](./privacy-impact-assessment.md)                                                                                       |
| 4   | Privacy-management program                              | Privacy Lead                   | [`privacy-management-program.md`](./privacy-management-program.md)                                                                                     |
| 5   | Data inventory and data-flow map                        | Privacy Lead + Engineering     | [`data-inventory-and-flow.md`](./data-inventory-and-flow.md)                                                                                           |
| 6   | Field-level legal authority and business purpose        | Privacy Lead + Engineering     | [`data-inventory-and-flow.md`](./data-inventory-and-flow.md)                                                                                           |
| 7   | Field elimination review                                | Privacy Lead + Engineering     | [`data-inventory-and-flow.md`](./data-inventory-and-flow.md)                                                                                           |
| 8   | Retention schedule                                      | Privacy Lead                   | [`retention-schedule.md`](./retention-schedule.md)                                                                                                     |
| 9   | Automated deletion / anonymization                      | Engineering                    | [`retention-schedule.md`](./retention-schedule.md) + migration `0069`                                                                                  |
| 10  | Access and correction procedures                        | Privacy Lead                   | [`access-and-correction.md`](./access-and-correction.md)                                                                                               |
| 11  | Guardian and driver privacy notices                     | Privacy Lead                   | [`notices/guardian-privacy-notice.md`](./notices/guardian-privacy-notice.md), [`notices/driver-privacy-notice.md`](./notices/driver-privacy-notice.md) |
| 12  | Student / independent-student processes                 | Privacy Lead                   | [`student-processes.md`](./student-processes.md)                                                                                                       |
| 13  | Guardian-authority verification (no custody narratives) | Privacy Lead + Engineering     | [`guardian-authority-verification.md`](./guardian-authority-verification.md)                                                                           |
| 14  | Privacy-breach assessment and notification              | Privacy Lead                   | [`breach-response.md`](./breach-response.md)                                                                                                           |
| 15  | Vendor / subprocessor reviews and agreements            | Privacy Lead + Product Owner   | [`subprocessors.md`](./subprocessors.md) + [`contract-checklist.md`](./contract-checklist.md)                                                          |
| 16  | Canadian processing and backup verification             | Engineering                    | [`subprocessors.md`](./subprocessors.md)                                                                                                               |
| 17  | Customer contract pack                                  | Privacy Lead + Product Owner   | [`contract-checklist.md`](./contract-checklist.md)                                                                                                     |

## 3. Exit gate

Phase 3 exits only when **all** of the following are true:

1. **Platform PIA and sourced legal assessment approved** by the accountable
   business roles; customer PIA authority/signature/submission is determined at
   onboarding. Specialist advice is optional unless specifically required.
2. **Privacy-management program operational** (roles, breach workflow,
   retention controls, access/correction path).
3. **Contracts and notices reviewed and approved** by accountable business roles
   against applicable law and actual operations (MSA, DPA, SLA, AUP, privacy
   policy, and tenant/guardian/driver notices).
4. **Retention and deletion controls tested** under an explicitly approved
   target/workflow, with reviewed fixture/trigger statements and retained
   evidence; no reset, migration replay or destructive production test is
   authorized by drafting this package.
5. **Canadian processing and any permitted cross-border arrangement verified**
   per actual supplier/database/backup/CDN/function/email/map/billing/support
   flow. A Canadian database alone does not prove Canadian-only processing.
6. **Privacy-breach exercise completed** (tabletop walkthrough recorded).

## 4. Engineering artifacts produced in this phase

- `supabase/migrations/0069_phase3_retention_foundation.sql` — retention
  policy table, retention RPCs, automated deletion functions, RLS, and audit
  integration.
- `tests/rls/phase3-retention-rls.sql` — RLS regression for retention policy
  access, deletion RPC authorization, and tenant isolation.
- `apps/web/netlify/functions/safebus-retention-scheduled.mjs` and
  `netlify.toml` — daily, server-only retention execution that defaults to
  dry-run until explicitly enabled after approval.
- Updates to `docs/MILESTONE_STATUS.md`, `docs/migration-ledger.md`,
  `../risk-register.md`, and `../decision-log.md`.

## 5. Out of scope for Phase 3

Phase 3 does **not** implement:

- Live GPS changes, map provider selection, QR, notifications delivery,
  SMS, SIS integration, or production deployment (those belong to their own
  milestones).
- Final policy publication or commercial activation. The current source has
  public and role-specific notice pages; final identity/contact, supplier,
  retention and accountable approvals remain required.
- Determination of the final subprocessor list (vendors are named as
  placeholders until contract review completes).

## 6. Rule of precedence

This directory supplies Phase-3 evidence and draft controls. It does not
override [`../product-scope.md`](../product-scope.md),
[`../data-classification.md`](../data-classification.md),
[`../risk-register.md`](../risk-register.md), or `AGENTS.md`. If a conflict
arises, those sources win until resolved through a `decision-log.md` entry.

Legal conclusions in this directory are **prepared for accountable review**. Engineering
words such as "SafeBus acts as a service provider" describe the expected
analysis only and are not a legal determination.

## 7. Machine-readable exit evidence

The fail-closed Point 6 contract is
[`../privacy-readiness.json`](../privacy-readiness.json), documented in
[`../point-6-privacy-readiness.md`](../point-6-privacy-readiness.md). Its
committed state remains `not_approved`. It does not replace substantive legal/privacy review,
execute an agreement, publish a policy, or authorize production processing.
