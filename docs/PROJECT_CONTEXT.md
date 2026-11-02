# SafeBus — Codex / ChatGPT project context

**Handoff date:** 2026-11-01 (America/Edmonton)  
**Repository:** `Davinder498/SafeBus-GLM`  
**Baseline:** merged PR [#339](https://github.com/Davinder498/SafeBus-GLM/pull/339). Always fetch the latest `main` before doing new work; this document is a handoff, not a claim that the branch will remain unchanged.

This document explains owner-approved product decisions and the current finishing workflow. It supplements, but **does not replace**, the enforceable safety, release, QA, and database rules in [`AGENTS.md`](../AGENTS.md), the product decision log, and governance documents. Where status is uncertain, inspect the current code, migrations, PRs, CI, and deployed environment rather than treating this handoff as runtime evidence.

## 1. Product and customers

- Public product name: **SafeBus** (operator: Sachman Gold Inc., doing business as SafeBus). Public principle: **“Track the bus, not the child.”** Follow [product naming](product-naming.md).
- Initial market: school districts/school authorities in Alberta, Canada.
- **One school district/authority is one tenant.** `tenant_admin` is the district/authority administrator; `transportation_admin` manages transport operations district-wide. Platform administrators administer the SaaS platform.
- **Individual schools do not use the application as administrators.** Do not add, invite, restore, or authorize a `school_admin` role or school administrator portal. Some legacy schemas/types may retain an inert historical role value for compatibility or audit. Do not reactivate it.
- School records are optional organizational metadata; a district can manage many schools and buses/routes can serve multiple schools. A school is **not** a separate tenant or a required attribute of every route, bus, or student.
- Drivers work with assigned services; guardians access only authorized linked students and the eligible bus/stop information. Never expand one district's visibility into another's.
- SafeBus is **not** a Student Information System or a PowerSchool/SchoolEngage replacement.

## 2. Stable product behavior — preserve unless explicitly approved

### District operations
- Keep the district dashboard operations-first, responsive, and transparent about data freshness and bounded results. Never manufacture on-time/delay metrics or imply partial samples cover the whole fleet.
- In route setup, allow selecting existing buses/drivers or navigating to create new records, returning to the route workflow. **Require explicit assignment save**; do not silently reassign a bus or driver. See PR [#334](https://github.com/Davinder498/SafeBus-GLM/pull/334).
- Maintain uniqueness/validation for bus plates and driver identity using the existing actual schema and checks (licence number and available email/phone). Inspect the implemented constraints before changing any validation; do not build parallel records or alter business logic casually.
- Live operations uses existing authorized monitoring/ETA data, clear GPS freshness indicators, and safe fallbacks when disconnected or provider calls fail. Respect all role and tenant restrictions.

### Student roster and guardians
- District admins may manage students; school association is optional. Guardian/student links are explicit, tenant-scoped and authorization-checked.
- PR [#339](https://github.com/Davinder498/SafeBus-GLM/pull/339) delivered **read-only, current-page** roster review hints, optional school/status filters, and a student workspace summary. A “Possible match” is **not** a confirmed duplicate; “Bus preview complete” is **not** proof of complete service/coverage. Never automatically merge, repair, change eligibility, or modify students due to a review badge.
- The current-page review filter/counters are **not district-wide**. Do not promote them into all-district claims without a separately designed authorized server query and acceptance.
- Preserve existing student create/edit, authorized guardian linking, directional transportation assignment, and CSV staging/dry-run/explicit-commit behavior.
- Guardians see only linked students and the approved assigned-bus/stop information. On the live map, show the bus rather than exposing internal trip/route identifiers or tracking a child as a GPS target.

### Driver and GPS
- Drivers see only assigned buses/services/trips and can start an eligible trip through the existing workflow. Trip start activates location reporting; there is not a second user-facing “start sharing location” action.
- The approved active-trip location cadence is **5 seconds** where supported. Respect platform permission/background limits and the actual mobile implementation; never claim a hard 5-second guarantee in every operating-system state.
- Preserve pickup/drop-off recording, driver confirmation safeguards, event authorization, recipient notification preferences, and trip privacy boundaries.

## 3. Technical and security boundaries

- Monorepo: React/TypeScript/Vite web, shared packages, Capacitor Android, pnpm/Turborepo, Supabase Auth/Postgres/RLS, Netlify. Read `README.md` and code for the latest structure.
- Production database: existing hosted **BusSafe** Supabase project; no separately approved DEV/staging project. Preserve the repository's protected release process. Do not reset, replay the full migration chain, seed real data, or run destructive/RLS fixture tests against production. Read the detailed approved exceptions and conditions in `AGENTS.md`.
- Sensitive data must be tenant-scoped and role-scoped **on the server**. Frontend filtering alone is never authorization. Keep administrator MFA, least privilege, authorization RPCs, and audit behavior.
- Guardians must not see unrelated student records. Drivers must not access unassigned operations. Never add student home address, health data, Alberta Student Number, public RLS bypasses, or frontend service-role keys.
- Normal provider/security controls, opt-outs, rate limits, and protected release gates still apply; documentation or passing mocked tests is not deployment certification.
- The user has **deferred routine Supabase Security Advisor cleanup** until the competitor-comparison follow-ups are finished. This is a sequencing preference, **not** permission to ignore a newly discovered critical exploitable authorization issue.
- Existing security-review work includes [#337](https://github.com/Davinder498/SafeBus-GLM/pull/337) (retired individual-school admin role) and [#338](https://github.com/Davinder498/SafeBus-GLM/pull/338) (targeted privileged-function hardening). A targeted hardening is **not** a complete audit of every privileged function. Confirm actual hosted migration state before subsequent database work.

## 4. Current work and finishing sequence

**Merged baseline acknowledged by owner:** PR #339 (student roster review and actionable student workspace). Relevant preceding product-UX/role work: [#333](https://github.com/Davinder498/SafeBus-GLM/pull/333) dashboard, [#334](https://github.com/Davinder498/SafeBus-GLM/pull/334) route workspace, [#335](https://github.com/Davinder498/SafeBus-GLM/pull/335) live operations, [#337](https://github.com/Davinder498/SafeBus-GLM/pull/337) school-role retirement, and [#338](https://github.com/Davinder498/SafeBus-GLM/pull/338) targeted security work.

**Next step for Codex in VS Code:** inspect current `main`, past competitor-comparison findings, PR acceptance notes, and the real running workflows. Produce a **remaining-gap list**, categorized as already shipped, incomplete, newly proposed, or blocked. The exact remaining comparison backlog is **not verified by this document**; do not invent features or mark them done. Prioritize operational simplicity, privacy, district-only administration and preserving functioning code. Propose the smallest bounded next milestone and its test plan before coding.

Finish the approved competitor-comparison items first. Then revisit deferred non-urgent Supabase Security Advisor findings and formal release readiness, keeping true security blockers visible regardless of milestone ordering.

Useful acceptance reference: [district student roster review checklist](qa/district-student-roster-review-acceptance-2026-11-01.md).

## 5. Working with ChatGPT and Codex

- **ChatGPT** is the product/architecture discussion and independent review partner. It does not automatically share this conversation history with VS Code Codex.
- **Codex in VS Code** inspects actual repository files, implements an approved bounded task, runs checks, and prepares the GitHub PR. Read this file and `AGENTS.md` at the start of each new task.
- **Human owner** approves scope and final merge. Follow the repository's feature-branch, PR, and protected release rules; do not treat a documentation change as permission to push production changes.
- Before implementing: show the precise behavior to change, the affected roles, boundaries, migration implications, and acceptance tests. Preserve existing business logic by default; get approval for substantial logic/schema/role changes.
- For changes, run the applicable root checks (`pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`) and targeted browser/mobile tests; perform Android build then sync as directed by `AGENTS.md`. State exactly what ran and what could not be verified.
- Report **implemented / locally tested / CI-verified / deployed / manually verified** separately. A merged PR is not automatically proof of a production deployment or real-device behavior.
- Never store secrets, student records, private communications, or unredacted customer data in the handoff.

**Keep this context short and accurate.** When product decisions change, update the decision source and this file through review instead of allowing conflicting agent instructions to accumulate.
