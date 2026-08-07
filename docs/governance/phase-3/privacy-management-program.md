# SafeBus Alberta — Phase 3 Privacy-Management Program

**Status:** Draft for privacy-professional operationalization
**Owner:** Privacy Lead
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-08-07

---

## 1. Purpose

Phase 3 requires an operational **privacy-management program**, not just
documents. This program defines the roles, responsibilities, controls, and
review cadence that keep SafeBus compliant after the PIA is signed.

## 2. Roles and responsibilities

| Role | Privacy responsibilities | Backup |
| --- | --- | --- |
| **Privacy Lead / Counsel** | Owns PIA, retention schedule, breach workflow, vendor reviews, access/correction decisions | Named deputy required |
| **Security Lead** | Owns RLS matrix, data classification, incident detection, audit review | Named deputy required |
| **Engineering Lead** | Implements retention controls, access paths, deletion jobs, audit events | Named deputy required |
| **Product Owner** | Approves scope changes that affect privacy; sign-off on notices and contracts | — |
| **Platform Super Admin** | Runs retention deletion; reads platform-wide audit; does **not** see tenant operational/personal data | — |
| **Tenant Admin** | Handles access/correction requests for their tenant; reads their own audit trail | — |

Every privacy-sensitive role requires a **named backup** so the program
survives staff changes.

## 3. Controls inventory

| Control | Owner | Evidence |
| --- | --- | --- |
| PIA maintained and current | Privacy Lead | `privacy-impact-assessment.md` |
| Retention schedule enforced | Engineering Lead | migration `0069`; `tests/rls/phase3-retention-rls.sql` |
| Data classification current | Security Lead | `../data-classification.md` |
| Field inventory current | Engineering Lead | `data-inventory-and-flow.md` |
| Subprocessor list and agreements | Privacy Lead + Product Owner | `subprocessors.md`, `contract-checklist.md` |
| Access/correction procedure | Privacy Lead | `access-and-correction.md` |
| Breach response procedure | Privacy Lead | `breach-response.md` |
| Audit trail of sensitive actions | Security Lead | migration `0066` `audit_events` |
| MFA for admin accounts | Security Lead | migration `0067` |
| RLS regression coverage | Engineering Lead | `tests/rls/*.sql` |

## 4. Operational cadence

| Activity | Frequency | Owner |
| --- | --- | --- |
| Retention deletion run | At least monthly (draft; counsel confirms) | Platform Super Admin via scheduled job |
| Audit-trail review (anomaly sweep) | Monthly | Security Lead |
| PIA re-review | Annually, or on any material scope/retention/subprocessor change | Privacy Lead |
| Subprocessor re-review | Annually, or on any new vendor | Privacy Lead + Product Owner |
| Breach-response tabletop | Annually | Privacy Lead |
| RLS regression execution | Every migration affecting access | Engineering Lead |

## 5. Training

All personnel with access to production data or admin functions complete
privacy and security training before access is granted and annually
thereafter. The Privacy Lead records completion outside the codebase.

## 6. Records

The program keeps the following records (most live in this repository;
training completion lives outside it):

- PIA and sign-off.
- Decision log entries for every privacy-relevant decision.
- Retention run logs (`retention_deletion_runs` + `audit_events`).
- Access/correction request records.
- Breach records and post-incident reviews.
- Subprocessor agreements and review notes.

## 7. Continuous improvement

Lessons from audits, access requests, and incidents flow into the risk
register and decision log. The Privacy Lead owns follow-up actions and
tracks them to closure at the next phase exit gate.