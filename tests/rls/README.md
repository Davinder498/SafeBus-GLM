# SafeBus RLS Regression Tests

## What These Tests Cover

These SQL test scripts verify the most security-critical RLS policies and RPCs
in SafeBus, focusing on tenant isolation and role boundaries that UI-level
Playwright smoke tests cannot exercise (because Playwright tests mock Supabase
HTTP responses and never touch the real database).

### Student Roster RLS (`student-roster-rls.sql`)

Tests the `can_write_student_roster()` helper and the student INSERT/UPDATE
RLS policies (from migrations 0016 + 0017):

| # | Test | Role | Expected |
|---|------|------|----------|
| 1 | Create student with NULL school_id | tenant_admin | ✅ Pass |
| 2 | Create student with same-tenant school_id | tenant_admin | ✅ Pass |
| 3 | Create student with cross-tenant school_id | tenant_admin | ❌ Blocked |
| 4 | Update same-tenant student basic fields | tenant_admin | ✅ Pass |
| 5 | Update student to cross-tenant school_id | tenant_admin | ❌ Blocked |
| 6 | Update another tenant's student | tenant_admin | ❌ Blocked (0 rows) |
| 7 | Create student with NULL school_id | school_admin | ❌ Blocked |
| 8 | Create student with own school_id | school_admin | ✅ Pass |
| 9 | Create student with another school's school_id | school_admin | ❌ Blocked |
| 10 | Insert student | guardian | ❌ Blocked |
| 11 | Update student | guardian | ❌ Blocked (0 rows) |
| 12 | Insert student | driver | ❌ Blocked |
| 13 | Update student | driver | ❌ Blocked (0 rows) |

### Guardian Visibility RLS (`guardian-visibility-rls.sql`)

Tests the `get_guardian_student_route_visibility()` RPC and guardian-scoped
student_guardians SELECT policies:

| # | Test | Role | Expected |
|---|------|------|----------|
| 1 | See actively linked students via RPC | guardian | ✅ Returns linked student |
| 2 | Does NOT see inactive-link students | guardian | ✅ Excluded |
| 3 | Does NOT see cross-tenant students | guardian | ✅ Excluded |
| 4 | Cannot use guardian RPC | driver | ✅ Returns 0 rows |
| 5 | Cannot use guardian RPC as broad query | tenant_admin | ✅ Returns 0 rows |
| 6 | Can read own student_guardians links | guardian | ✅ Returns own links |
| 7 | Cannot read other guardian's links | guardian | ✅ Returns 0 other links |

## How to Run These Tests

These tests are **MANUAL** — they require a live Supabase database with all
SafeBus migrations (0001–0017) applied. They cannot run in CI without a local
Supabase instance.

### Prerequisites

- Hosted Supabase DEV project (or local Supabase via `supabase start`)
- All SafeBus migrations applied (0001 through 0017)
- SQL Editor access (or `psql` connection)

### Steps

1. Open the Supabase DEV project's SQL Editor.
2. Open `tests/rls/student-roster-rls.sql`.
3. Run the **SEED** block (the first large section that creates test tenants,
   schools, profiles, students, etc.).
4. Run each **TEST** block individually. Each test uses a `DO $$ ... $$` block
   that raises a `NOTICE` on success or an `EXCEPTION` on failure.
5. After all student roster tests pass, run the **guardian visibility** tests
   from `tests/rls/guardian-visibility-rls.sql` (the seed data from step 3
   is still needed — do not clean up yet).
6. Run the **CLEANUP** block from `student-roster-rls.sql` to remove all
   test data.

### Interpreting Results

- `NOTICE: TEST N PASSED: ...` → the test passed.
- `ERROR: TEST N FAILED: ...` → the test failed. The RLS policy is not working
  as expected and needs investigation.

## Why RLS Tests Are Needed

Playwright smoke tests verify **UI behavior** with mocked Supabase responses.
They confirm that the React form submits correctly and displays the right
error messages, but they **do not verify that the real database RLS policies
block unauthorized access**. A mock will always return whatever the test
author configured — it cannot catch:

- A policy that accidentally allows cross-tenant writes.
- A helper function that returns `true` for the wrong role.
- A missing `WITH CHECK` clause that allows updating to an invalid state.
- An RPC that returns data for a role that should be blocked.

RLS regression tests exercise the **actual SQL policies** against real data
and real role contexts, catching security holes that UI tests cannot see.

## Automated vs Manual

| Test Type | Automated? | Notes |
|-----------|-----------|-------|
| Student roster RLS | ❌ Manual | Requires live Supabase DEV |
| Guardian visibility RLS | ❌ Manual | Requires live Supabase DEV |
| Playwright UI smoke | ✅ Automated (`pnpm test:smoke`) | Mocked Supabase, no DB needed |

To automate these RLS tests in CI, a local Supabase instance (via
`supabase start`) or a disposable Postgres container with the migrations
applied would be needed. This is a future infrastructure improvement.
