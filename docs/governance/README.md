# SafeBus Alberta — Phase 0 Governance Baseline

> Source of truth for the frozen product boundary, data-classification standard,
> customer profile, capacity assumptions, ownership model, risk register, and
> decision log. These documents define how every future SafeBus milestone is
> approved.

This directory implements the **Phase 0 — Product and governance baseline**
exit gate. Nothing in here changes code or the database; it freezes the rules
every later phase must obey.

## Documents

| Document                                                                   | Exit-gate item it satisfies                                          |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`commercial-release-scope.md`](./commercial-release-scope.md)             | Binding Commercial Release 1 boundary and launch-gate map            |
| [`point-5-authorization-evidence.md`](./point-5-authorization-evidence.md) | Point 5 baseline, hardening controls, and hosted exit evidence       |
| [`point-6-privacy-readiness.md`](./point-6-privacy-readiness.md)           | Point 6 legal, contract, vendor, residency, and privacy evidence     |
| [`point-7-android-readiness.md`](./point-7-android-readiness.md)           | Point 7 signed bundle, field, Play, and BYOD evidence gate           |
| [`point-8-map-readiness.md`](./point-8-map-readiness.md)                   | Point 8 provider, outage controls, and operating evidence            |
| [`point-9-operational-readiness.md`](./point-9-operational-readiness.md)   | Point 9 monitoring, incident, support, and recovery evidence         |
| [`point-10-product-verification.md`](./point-10-product-verification.md)   | Point 10 authenticated, accessibility, resilience, and load evidence |
| [`point-11-pilot-authorization.md`](./point-11-pilot-authorization.md)     | Point 11 pilot scope, authorization, stop, and exit evidence         |
| [`github-actions-supply-chain.md`](./github-actions-supply-chain.md)       | Immutable CI dependency controls and update procedure                |
| [`edge-function-retirement.md`](./edge-function-retirement.md)             | Retired Supabase function inventory and deployment boundary          |
| [`product-scope.md`](./product-scope.md)                                   | Signed product scope                                                 |
| [`role-responsibility-matrix.md`](./role-responsibility-matrix.md)         | Signed role and responsibility matrix                                |
| [`data-classification.md`](./data-classification.md)                       | Approved data classification                                         |
| [`first-customer-profile.md`](./first-customer-profile.md)                 | Approved first-customer profile                                      |
| [`capacity-assumptions.md`](./capacity-assumptions.md)                     | Written capacity assumptions                                         |
| [`feature-inventory.md`](./feature-inventory.md)                           | Authoritative feature inventory (current vs. future)                 |
| [`risk-register.md`](./risk-register.md)                                   | Formal risk register                                                 |
| [`decision-log.md`](./decision-log.md)                                     | Formal decision log                                                  |
| [`development-workflow.md`](./development-workflow.md)                     | Confirmed development workflow                                       |

## Reading order

1. `commercial-release-scope.md` — the proposed CR1 commitment and release gates.
2. `product-scope.md` — the permanent non-negotiable product boundary.
3. `data-classification.md` — how every table is classified.
4. `feature-inventory.md` — what is current vs. future, with decisions on
   drifted features.
5. Everything else.

## Status

The Commercial Release 1 product boundary, feature inventory, and first-customer
profile were approved by the Platform Administrator through DL-010 on
2026-08-12. Other governance artifacts keep their own status and approval
requirements; CR1 scope approval does not approve legal, security, privacy,
capacity, or operational launch gates.

## Rule of precedence

If any code, migration, RPC, RLS policy, doc, or chat decision conflicts with
these documents, these documents win until the conflict is resolved through a
formal decision-log entry. AGENTS.md repo rules continue to apply on top of
this baseline.
