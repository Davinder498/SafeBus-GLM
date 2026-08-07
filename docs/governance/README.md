# SafeBus Alberta — Phase 0 Governance Baseline

> Source of truth for the frozen product boundary, data-classification standard,
> customer profile, capacity assumptions, ownership model, risk register, and
> decision log. These documents define how every future SafeBus milestone is
> approved.

This directory implements the **Phase 0 — Product and governance baseline**
exit gate. Nothing in here changes code or the database; it freezes the rules
every later phase must obey.

## Documents

| Document | Exit-gate item it satisfies |
| --- | --- |
| [`product-scope.md`](./product-scope.md) | Signed product scope |
| [`role-responsibility-matrix.md`](./role-responsibility-matrix.md) | Signed role and responsibility matrix |
| [`data-classification.md`](./data-classification.md) | Approved data classification |
| [`first-customer-profile.md`](./first-customer-profile.md) | Approved first-customer profile |
| [`capacity-assumptions.md`](./capacity-assumptions.md) | Written capacity assumptions |
| [`feature-inventory.md`](./feature-inventory.md) | Authoritative feature inventory (current vs. future) |
| [`risk-register.md`](./risk-register.md) | Formal risk register |
| [`decision-log.md`](./decision-log.md) | Formal decision log |
| [`development-workflow.md`](./development-workflow.md) | Confirmed development workflow |

## Reading order

1. `product-scope.md` — the non-negotiable product boundary.
2. `data-classification.md` — how every table is classified.
3. `feature-inventory.md` — what is current vs. future, with decisions on
   drifted features.
4. Everything else.

## Status

Phase 0 is **drafted for product-owner sign-off**. Each document carries a
`Status:` line that must move from `Draft` to `Approved` with a dated
sign-off record in `decision-log.md` before Phase 1 exits.

## Rule of precedence

If any code, migration, RPC, RLS policy, doc, or chat decision conflicts with
these documents, these documents win until the conflict is resolved through a
formal decision-log entry. AGENTS.md repo rules continue to apply on top of
this baseline.