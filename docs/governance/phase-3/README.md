# SafeBus Alberta — Phase 3: Alberta Privacy and Legal Readiness

**Status:** Drafted for counsel and privacy-professional review — not legal advice
**Owner:** Privacy Lead / Counsel
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-08-07

---

## 1. Purpose

Phase 3 establishes **lawful, documented handling** of student, guardian,
driver, and location information under Alberta law. It is owned by the
**Privacy Lead / Counsel**, not engineering. Engineering supplies evidence
(describing what the system collects, why, where it is stored, how it is
protected, and how it is deleted); engineering does **not** make legal
determinations alone.

This phase closes the two Phase-3-tracked risks in
[`../risk-register.md`](../risk-register.md):

- **R-006** — Obsolete FOIP references; correct POPA/ATIA/PIPA analysis not done.
- **R-011** — No retention/deletion automation for location history,
  invitations, trip records, audit records, and notifications.

## 2. Workstreams

| # | Workstream | Lead | Document |
| --- | --- | --- | --- |
| 1 | Statutory mapping (FOIP → POPA/ATIA/PIPA) | Counsel | [`legal-role-analysis.md`](./legal-role-analysis.md) |
| 2 | SafeBus legal role per customer type | Counsel | [`legal-role-analysis.md`](./legal-role-analysis.md) |
| 3 | Privacy Impact Assessment (PIA) | Privacy Lead | [`privacy-impact-assessment.md`](./privacy-impact-assessment.md) |
| 4 | Privacy-management program | Privacy Lead | [`privacy-management-program.md`](./privacy-management-program.md) |
| 5 | Data inventory and data-flow map | Privacy Lead + Engineering | [`data-inventory-and-flow.md`](./data-inventory-and-flow.md) |
| 6 | Field-level legal authority and business purpose | Privacy Lead + Engineering | [`data-inventory-and-flow.md`](./data-inventory-and-flow.md) |
| 7 | Field elimination review | Privacy Lead + Engineering | [`data-inventory-and-flow.md`](./data-inventory-and-flow.md) |
| 8 | Retention schedule | Privacy Lead | [`retention-schedule.md`](./retention-schedule.md) |
| 9 | Automated deletion / anonymization | Engineering | [`retention-schedule.md`](./retention-schedule.md) + migration `0069` |
| 10 | Access and correction procedures | Privacy Lead | [`access-and-correction.md`](./access-and-correction.md) |
| 11 | Guardian and driver privacy notices | Privacy Lead | [`notices/guardian-privacy-notice.md`](./notices/guardian-privacy-notice.md), [`notices/driver-privacy-notice.md`](./notices/driver-privacy-notice.md) |
| 12 | Student / independent-student processes | Privacy Lead | [`student-processes.md`](./student-processes.md) |
| 13 | Guardian-authority verification (no custody narratives) | Privacy Lead + Engineering | [`guardian-authority-verification.md`](./guardian-authority-verification.md) |
| 14 | Privacy-breach assessment and notification | Privacy Lead | [`breach-response.md`](./breach-response.md) |
| 15 | Vendor / subprocessor reviews and agreements | Privacy Lead + Product Owner | [`subprocessors.md`](./subprocessors.md) + [`contract-checklist.md`](./contract-checklist.md) |
| 16 | Canadian processing and backup verification | Engineering | [`subprocessors.md`](./subprocessors.md) |
| 17 | Customer contract pack | Counsel + Product Owner | [`contract-checklist.md`](./contract-checklist.md) |

## 3. Exit gate

Phase 3 exits only when **all** of the following are true:

1. **PIA approved** by the appropriate authority (counsel sign-off recorded in
   [`../decision-log.md`](../decision-log.md)).
2. **Privacy-management program operational** (roles, breach workflow,
   retention controls, access/correction path).
3. **Contracts and notices approved by counsel** (MSA, DPA, SLA, AUP,
   privacy policy, and guardian/driver notices).
4. **Retention and deletion controls tested** (migration `0069` applied to
   hosted DEV; `tests/rls/phase3-retention-rls.sql` executed with evidence).
5. **Canadian processing requirements verified** contractually and
   technically (ca-central-1; no cross-border personal-data flows except as
   approved by counsel).
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
- A public-facing privacy-policy page in the web app (the policy text is
  drafted here; publishing is an operational step after counsel sign-off).
- Determination of the final subprocessor list (vendors are named as
  placeholders until contract review completes).

## 6. Rule of precedence

This directory supplies Phase-3 evidence and draft controls. It does not
override [`../product-scope.md`](../product-scope.md),
[`../data-classification.md`](../data-classification.md),
[`../risk-register.md`](../risk-register.md), or `AGENTS.md`. If a conflict
arises, those sources win until resolved through a `decision-log.md` entry.

Legal conclusions in this directory are **drafts for counsel**. Engineering
words such as "SafeBus acts as a service provider" describe the expected
analysis only and are not a legal determination.
