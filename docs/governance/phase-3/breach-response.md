# SafeBus Alberta — Phase 3 Privacy-Breach Assessment and Notification

**Status:** Draft for counsel confirmation — thresholds are not legal advice
**Owner:** Privacy Lead
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-08-07

---

## 1. Purpose

Phase 3 requires a **privacy-breach assessment and notification procedure**.
This document defines how SafeBus identifies, contains, assesses, notifies,
and reviews a privacy breach. A tabletop exercise against this procedure is
a Phase 3 exit-gate requirement.

## 2. Definition of a privacy breach

A privacy breach is the loss of, unauthorized access to, or unauthorized
disclosure of personal information. Examples relevant to SafeBus:

- An RLS failure that exposes another tenant's students, guardians, or
  drivers.
- A service-role key exposed in frontend code, logs, or a screenshot.
- A lost or compromised admin account.
- A subprocessor incident affecting SafeBus personal data.
- A misconfigured notification that sends a pickup/drop-off email to the
  wrong guardian.

## 3. Severity assessment (draft matrix — counsel confirms)

| Factor | Real risk of significant harm? | Severity |
| --- | --- | --- |
| Student/guardian/driver identity exposed to another tenant or public | Yes | Critical |
| Live location exposed beyond an active trip / authorized guardian | Yes | Critical |
| Service-role key or auth secret exposed | Yes | Critical |
| Audit/personal data exposed to a platform admin beyond the allowed subset | Likely | High |
| Single misdirected notification to a wrong-but-linked guardian | Possible | Medium |
| Internal-only access by an authorized role, properly audited | No | Low / not a breach |

## 4. Response procedure

1. **Detect and contain** — Security Lead isolates the cause (revoke
   sessions via `revoke_all_user_sessions()`, rotate exposed secrets,
   quarantine the affected path).
2. **Preserve evidence** — snapshot `audit_events`, affected rows, and
   logs. Do **not** delete evidence; retain per `retention-schedule.md`.
3. **Assess scope and harm** — Privacy Lead applies the §3 matrix with
   counsel.
4. **Notify** — per §5.
5. **Remediate** — fix the root cause; add regression RLS test.
6. **Post-incident review** — record lessons in `decision-log.md` and
   `risk-register.md`; update the PIA if material.
7. **Record** — every breach and its outcome is logged whether or not
   external notification occurs.

## 5. Notification thresholds (draft — counsel confirms)

| Severity | Notify | Target timeline (draft) |
| --- | --- | --- |
| Critical | Affected individuals + the customer + the Privacy Commissioner as required by statute | Without unreasonable delay; counsel confirms the statutory deadline |
| High | The customer + Privacy Lead + counsel | 24 hours internal; external per statute |
| Medium | The customer + Privacy Lead | 72 hours internal |
| Low / not a breach | Internal record only | At review |

> Engineering cannot determine statutory notification deadlines. Counsel
> sets the binding timelines and the recipient definitions.

## 6. Roles during a breach

- **Incident Commander** — Security Lead (or named deputy).
- **Privacy decision-maker** — Privacy Lead / Counsel.
- **Comms** — Product Owner with the customer.
- **Engineering** — containment, evidence, regression test.

## 7. Tabletop exercise (exit gate)

Before Phase 3 exits, the team completes a recorded tabletop walkthrough
of a hypothetical critical breach (e.g., RLS regression exposing student
identity cross-tenant). The exercise validates:

- Detection path (audit anomaly or external report).
- Containment actions and their RPCs.
- Assessment against the §3 matrix.
- Notification decisions recorded for counsel.
- Post-incident review and risk-register update.

The walkthrough outcome is summarized in this document's appendix when run.

## 8. Counsel confirmation items

- [ ] Confirm the §3 severity matrix.
- [ ] Confirm the §5 notification thresholds and statutory deadlines.
- [ ] Confirm who counts as an "affected individual" for each breach type.
- [ ] Confirm records-retention for breach evidence.

## 9. Appendix — Tabletop record

_To be completed when the exercise is run._