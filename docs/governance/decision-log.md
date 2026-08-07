# SafeBus Alberta — Decision Log

**Status:** Living document — append-only
**Owner:** Product Owner
**Phase:** 0 — Product and governance baseline
**Last updated:** 2026-08-06

---

## 1. Purpose

Phase 0 requires a **formal decision log**. Every non-trivial product, scope,
architecture, security, or privacy decision is recorded here so that future
milestones (and future reviewers) can see *why* the system is the way it is.

This log is **append-only**. Entries are never deleted; superseded entries
get a `Superseded by DL-XXX` line and remain for history.

## 2. Entry format

```
### DL-NNN — Title
- Date: YYYY-MM-DD
- Decision: <one-line decision>
- Context: <why now, what problem>
- Options considered: <brief>
- Rationale: <why this option>
- Consequences: <what changes, what to update>
- Owner: <role>
- Status: Proposed | Accepted | Superseded by DL-NNN
```

## 3. Seeded entries (Phase 0)

### DL-001 — SafeBus is a transportation platform, not an SIS
- Date: 2026-08-06
- Decision: SafeBus is a school transportation operations and live bus
  visibility platform. It is not a PowerSchool/SchoolEngage replacement or a
  full school management system.
- Context: Phase 0 product-boundary freeze.
- Options considered: Build a broad school platform vs. stay narrow to
  transportation.
- Rationale: Existing SISs already handle enrollment/grades/attendance;
  SafeBus's value is operational bus visibility under "track the bus, not the
  child."
- Consequences: Defines out-of-scope items in `product-scope.md` §8; blocks
  future feature requests that cross the boundary.
- Owner: Product Owner
- Status: Proposed (awaiting sign-off)

### DL-002 — "Track the bus, not the child" is an enforceable rule
- Date: 2026-08-06
- Decision: The unit of live tracking is the bus attached to an authorized
  active trip. Guardians see the assigned bus, never a child-carried device.
  Live location is collected only during an active trip.
- Context: Phase 0 architectural rule.
- Options considered: Per-child GPS; hybrid model; bus-only model.
- Rationale: Bus-only model minimizes privacy surface and aligns with the
  product promise; per-child tracking is prohibited data.
- Consequences: Drives RLS, retention, and the feature inventory; student
  badges/QR (D1) must be quarantined.
- Owner: Product Owner
- Status: Proposed (awaiting sign-off)

### DL-003 — First customer is a public school authority
- Date: 2026-08-06
- Decision: The first customer profile is an Alberta public school authority.
- Context: Phase 0 first-customer-profile requirement.
- Options considered: Public authority, charter, private, contractor.
- Rationale: Exercises the scale architecture and matches the POPA/ATIA
  analysis best. See `first-customer-profile.md`.
- Consequences: Phase 3 legal-role analysis assumes "contracted operator on
  behalf of a public body"; pilot envelope is 1–3 tenants / 25–100 buses.
- Owner: Product Owner
- Status: Proposed (awaiting sign-off)

### DL-004 — Capacity definitions disambiguated
- Date: 2026-08-06
- Decision: "500,000 users" is split into registered (500k), DAU (150k),
  expected concurrent (30k), emergency peak (100k), and 20,000 simultaneously
  reporting buses.
- Context: Phase 0 capacity-assumptions requirement; risk R-013.
- Options considered: Single headline number vs. decomposed targets.
- Rationale: Conflating registered with concurrent under-designs the
  realtime/ingestion backplane.
- Consequences: Drives Phase 9 ingestion and realtime design; Phase 12
  staging ceilings fixed.
- Owner: Engineering Lead
- Status: Proposed (awaiting sign-off)

### DL-005 — Do not rename applied migrations; reconcile via ledger + corrective migration
- Date: 2026-08-06
- Decision: The duplicate migration identifiers (`0042`, `0043`, `0058`) will
  be reconciled by (a) creating an authoritative migration ledger mapping
  filename → applied checksum → intent, and (b) adding a corrective migration
  that asserts final schema state — **not** by renaming migrations already
  recorded in hosted DEV.
- Context: Phase 1 migration-integrity requirement; risk R-001. Supabase keys
  its ledger on filename, so in-place renames desync deployed environments.
- Options considered: Rename duplicates in place; archive + corrective
  migration; full reset.
- Rationale: Honors the plan's explicit "Do not blindly rename migrations
  already recorded in a database" rule and keeps hosted DEV consistent.
- Consequences: A `0065_migration_ledger_reconciliation.sql` (or similar)
  will be produced in Phase 1; losers of collisions move to
  `supabase/legacy/` with pointers.
- Owner: Engineering Lead
- Status: Proposed (governs Phase 1 execution)

### DL-006 — Scope-drift handling per feature
- Date: 2026-08-06
- Decision: Drifted features are handled case-by-case as recorded in
  `feature-inventory.md` §4:
  - D1 Student QR badges → **Keep & Future (quarantine)**
  - D2 Bus QR sessions → **Promote-with-milestone** (bus, not child)
  - D3 Safe ETA → **Keep & Future (quarantine)**
  - D4 Notifications/email → **Promote-with-milestone** only if Phase 15A was
    product-owner approved (verify PR #52 sign-off); otherwise quarantine
  - D5 Student-only CSV import → **Keep & Current**
  - D6 Platform tenant onboarding/privacy boundary → **Keep & Current**
  - D7 PostGIS foundation → **Keep & Future (foundation only)**
- Context: Phase 0 "no future milestones mixed into current work"; risk R-002.
- Options considered: Wholesale removal; wholesale promotion; case-by-case.
- Rationale: Removal loses useful infrastructure; promotion without approval
  violates governance; case-by-case with this log is the compliant path.
- Consequences: Phase 0/1 must physically quarantine D1 and D3 from
  user-facing routes; D2 and D4 require explicit sign-off entries to become
  current.
- Owner: Product Owner
- Status: Proposed (awaiting sign-off)

### DL-007 — Development workflow confirmed
- Date: 2026-08-06
- Decision: Feature branches only; no direct changes to `main`; one milestone
  at a time; GLM may build; Codex reviews; human approves merge.
- Context: Phase 0 workflow confirmation.
- Options considered: Trunk-based; feature branches with auto-merge; gated
  feature branches with human approval.
- Rationale: Matches `AGENTS.md` and the plan's required validation gates.
- Consequences: Codified in `development-workflow.md`; enforced via protected
  branches in Phase 4.
- Owner: Product Owner
- Status: Proposed (awaiting sign-off)

## 4. Phase 0–3 remediation entries

### DL-008 — Scope-drift repository disposition implemented
- Date: 2026-08-07
- Decision: Quarantine student QR completely in the canonical schema and UI;
  retain previously merged bus QR, Safe ETA foundation, and guardian email MVP
  under their named milestones.
- Context: Phase 0 audit found code and migration state that did not match the
  product boundary.
- Rationale: Student badges conflict with "track the bus, not the child." The
  bus-session, ETA-foundation, and email work have identifiable merged
  milestone PRs and remain within their narrow approved forms.
- Consequences: Archived student-QR migration; `0054` no longer recreates its
  resolver; `0065` drops any applied objects; reachable student-QR UI and the
  unused mobile camera dependency are removed. Provider/traffic ETA, SMS,
  push, and student scanning remain future.
- Owner: Product Owner
- Status: Proposed (repository implementation complete; sign-off pending)

### DL-009 — Retention execution defaults to dry-run
- Date: 2026-08-07
- Decision: Materialize the draft retention schedule in migration `0069` and
  run it daily in count-only mode until counsel approves the periods and
  Operations explicitly enables destructive execution.
- Context: Phase 3 requires deletion/anonymization automation, but engineering
  cannot determine statutory retention periods or approve deletion alone.
- Rationale: Dry-run evidence exposes volume and schema errors without deleting
  data; a server-only explicit flag prevents accidental activation.
- Consequences: Counsel-approved period changes and activation require a
  forward migration; the database approval latch remains false and
  `SAFEBUS_RETENTION_EXECUTE=true` remains unset until the Phase 3 exit gate.
- Owner: Privacy Lead / Counsel
- Status: Proposed (engineering control complete; counsel approval pending)

## 5. Sign-off entries

When a Phase 0 document is signed off, add an entry here:

```
### DL-0NN — Sign-off: <document>
- Date: YYYY-MM-DD
- Decision: <document name> approved.
- Signatories: <names/roles>
- Status: Accepted
```
