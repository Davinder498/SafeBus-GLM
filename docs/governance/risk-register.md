# SafeBus Alberta — Risk Register

**Status:** Living document — reviewed at every milestone exit gate
**Owner:** Security Lead
**Phase:** 0 — Product and governance baseline
**Last updated:** 2026-08-16

---

## 1. Purpose

Phase 0 requires a **formal risk register**. Risks are tracked with an ID,
description, likelihood, impact, owner, mitigation, and status. A risk is
only "Closed" when its mitigation has been verified at a phase exit gate.

## 2. Severity scale

| Level    | Likelihood × Impact     | Meaning                                                               |
| -------- | ----------------------- | --------------------------------------------------------------------- |
| Critical | High × High             | Privacy leak or platform-blocking defect; stops work until mitigated. |
| High     | Either dimension High   | Must be resolved before the relevant phase exit gate.                 |
| Medium   | Moderate on one or both | Tracked; mitigated within the phase or next.                          |
| Low      | Low on both             | Accepted with monitoring.                                             |

## 3. Current risks

| ID    | Risk                                                                                                                       | Severity | Owner            | Status                                      | Mitigation / next action                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| R-001 | **Migration identifier collisions** (`0042`, `0043`, `0058`).                                                              | High     | Engineering Lead | Mitigated in repo; verification pending     | Ledger, archive, `0054` cleanup, and `0065` assertions implemented. Hosted-DEV clean rebuild still required.                        |
| R-003 | **Platform isolation not fully verified.**                                                                                 | High     | Security Lead    | Mitigated in repo; DEV review pending       | `0065` removes operational reads and Phase 1 RLS regression covers the narrow control plane.                                        |
| R-004 | **Driver over-authorization risk.**                                                                                        | High     | Security Lead    | Mitigated in repo; DEV review pending       | `0065` replaces tenant-wide bus/route reads with assignment-derived policies and expiry gates.                                      |
| R-005 | **Obsolete location-ingestion path** may be re-enabled by mistake.                                                         | Medium   | Engineering Lead | Mitigated in repo; DEV test pending         | `0065` retires the legacy function and Phase 1 regression covers the authoritative session path.                                    |
| R-006 | **FOIP references are obsolete;** legal-role mapping requires counsel.                                                     | High     | Privacy Lead     | Draft remediation; counsel pending          | README corrected and sourced POPA/ATIA/PIPA analysis drafted; conclusions remain unapproved.                                        |
| R-007 | **Admin MFA and recent-auth enforcement.**                                                                                 | High     | Security Lead    | Mitigated in repo; operational test pending | AAL2 route/RPC/function gates and recent-auth checks implemented; enrollment/recovery testing remains.                              |
| R-008 | **Sensitive administrative actions require append-only audit evidence.**                                                   | High     | Security Lead    | Mitigated in repo; DEV review pending       | Sanitized events, narrow writers, mutation triggers, and server action wiring implemented.                                          |
| R-009 | **React Router vulnerability** referenced in Phase 4 not yet patched.                                                      | Medium   | Engineering Lead | Open — Phase 4                              | Patch; add dependency-audit CI gate.                                                                                                |
| R-010 | **20,000-bus scale not demonstrated;** prototype-scale realtime/location design would fan out per guardian per bus update. | High     | Engineering Lead | Open — Phase 9                              | Separate ingestion path; durable stream; aggregate realtime by authorized channel; load-test 100/1k/5k/10k/20k buses.               |
| R-011 | **Retention/deletion automation** for personal and operational records.                                                    | High     | Privacy Lead     | Mitigated in repo; counsel/DEV pending      | `0069`, daily dry-run scheduler, failure evidence, and Phase 3 regression implemented; periods and destructive flag await approval. |
| R-012 | **Production secrets could reach developer machines or frontend.**                                                         | Medium   | Security Lead    | Open — Phase 4                              | Sole database classified as production; no DB credential in CI/non-production; protected production secrets; secret scanning; frontend limited to URL + public key. |
| R-013 | **"500,000 users" ambiguity** could lead to under- or over-design.                                                         | Medium   | Engineering Lead | Mitigated — Phase 0                         | Disambiguated in `capacity-assumptions.md` (registered vs DAU vs concurrent vs emergency peak).                                     |
| R-014 | **A pilot success being misread as launch authorization.**                                                                 | Medium   | Product Owner    | Mitigated — Phase 0                         | `capacity-assumptions.md` §4 states pilot does not authorize 20k launch; Phase 12 staging governs expansion.                        |
| R-015 | **Guardian cross-tenant or cross-student visibility leak.**                                                                | Critical | Security Lead    | Monitored — Phase 1                         | Existing RLS tests in `tests/rls/guardian-*.sql`; extend to every sensitive table for the Phase 1 exit gate.                        |
| R-016 | **Personal driver phones can be lost, shared, rooted, outdated, data-limited, or aggressively battery-optimized.**            | High     | Operations Lead  | Open — Phase 7                              | Enforce app credential revocation, encrypted app storage, screen-lock/current-patch eligibility, visible tracking, battery/data tests, mounted-power requirements, and a documented lost-device/support process. No MDM or remote wipe is assumed. |
| R-017 | **Google Play may reject or remove the app's background-location access.**                                                    | High     | Product Owner    | Mitigated in repo; Play review pending       | Prominent in-app disclosure precedes permission, collection is limited to driver-started active trips, API 36 is targeted, and the signed-release workflow exists. Publish the approved privacy-policy URL, declaration, review video, Data safety form, and test credentials before launch. |
| R-018 | **Map-provider outage, quota exhaustion, or key abuse could remove operational map context.**                                  | High     | Operations Lead  | Mitigated in repo; operating evidence pending | Geoapify is provider-locked behind server-managed config; all map surfaces fail to authoritative lists/status/direct coordinates; paid SLA plan, restricted-key evidence, quota alerts, Android acceptance, and seven-day observation remain mandatory before Point 8 approval. |

## 4. Closed risks

| ID    | Risk                                           | Severity | Owner         | Status          | Closure evidence                                                                                                                                                                                                           |
| ----- | ---------------------------------------------- | -------- | ------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-002 | **Scope drift** required explicit disposition. | High     | Product Owner | Closed — DL-010 | Student QR is quarantined; other drifted features have explicit CR1 dispositions; `commercial-release-scope.md`, `product-scope.md`, and `feature-inventory.md` were approved by the Platform Administrator on 2026-08-12. |

## 5. Review cadence

- Reviewed at every milestone exit gate.
- Critical/High risks block their owning phase's exit gate until mitigated
  or explicitly accepted by the product owner with a `decision-log.md` entry.
