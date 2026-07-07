# SafeBus RLS Regression Tests

These SQL scripts are manual security regression tests for the most critical
SafeBus database boundaries: tenant isolation, roster writes, guardian-scoped
visibility, and role behavior that UI smoke tests cannot prove.

Do not run these scripts against production. They are intended only for hosted
Supabase DEV or a disposable database with SafeBus migrations applied.

## Files

- `student-roster-rls.sql`: seeds shared fixed-ID test data, tests student
  roster INSERT/UPDATE RLS, and includes safe cleanup before and after tests.
- `guardian-visibility-rls.sql`: uses the student-roster seed data to test
  `get_guardian_student_route_visibility()` and guardian SELECT policies.

## `pnpm test:rls`

`pnpm test:rls` is a structural check only. It verifies that the RLS SQL files
and this README exist, then prints a manual-test notice.

It does not connect to Supabase, does not execute SQL, and must not be reported
as proof that the RLS assertions passed.

## Required Database Context

Run these scripts from a privileged SQL Editor/session in hosted Supabase DEV
or a disposable database. The setup inserts fixed test rows into:

- `auth.users`
- `public.tenants`
- `public.schools`
- `public.profiles`
- `public.guardians`
- `public.drivers`
- `public.students`
- `public.student_guardians`

The SQL Editor user must be allowed to insert/delete these test rows, including
direct inserts into `auth.users`.

## Transaction-Scoped User Simulation

Every simulated role test follows this pattern:

```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = '<user-id>';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"<user-id>","role":"authenticated"}';

do $$
begin
  if auth.uid() <> '<user-id>'::uuid then
    raise exception 'auth.uid() simulation failed';
  end if;

  if public.current_user_role() <> '<expected_role>' then
    raise exception 'role simulation failed';
  end if;

  -- RLS assertion here.
end
$$;

rollback;
```

`SET LOCAL` is transaction-scoped. Do not split role/JWT setup and assertions
into separate SQL Editor runs unless the explicit transaction remains open.

Both JWT GUC formats are set intentionally:

- `request.jwt.claim.sub` / `request.jwt.claim.role`
- JSON `request.jwt.claims`

Hosted Supabase/PostgREST helper behavior can differ by version. The mandatory
`auth.uid()` sanity assertion confirms which path works in the target database.

## How To Run

1. Confirm you are connected to hosted Supabase DEV or a disposable database,
   never production.
2. Confirm migrations `0001` through `0017` are applied.
3. Open `tests/rls/student-roster-rls.sql`.
4. Run the whole file, or run sections in order:
   - privileged cleanup-before-seed
   - privileged seed
   - individual test transactions
   - privileged cleanup-after-tests
5. To run guardian visibility tests separately, run the cleanup-before-seed and
   seed sections from `student-roster-rls.sql`, then run
   `guardian-visibility-rls.sql`, then run the cleanup-after-tests section from
   `student-roster-rls.sql`.

The project workflow currently forbids Docker-based local startup, `supabase
start`, and `supabase db reset`, so those are not part of this test workflow.

## Recovery And Cleanup

The cleanup blocks delete only fixed test IDs created by these scripts. If a
run fails midway, reconnect as the privileged SQL Editor user and run the
cleanup-after-tests section from `student-roster-rls.sql`.

Do not manually delete broad tenant, school, student, guardian, profile, or auth
tables. The cleanup is intentionally fixed-ID only.

## Student Roster Coverage

The roster script verifies:

- Tenant admin can create NULL-school and same-tenant-school students.
- Tenant admin can update own-tenant student fields, status, and NULL-school to
  same-tenant school.
- Tenant admin cannot use cross-tenant school IDs, move a student to another
  tenant, or update another tenant's student.
- Transportation admin can create/update own-tenant students, including
  NULL-school students.
- Transportation admin cannot write another tenant's student or use another
  tenant's school.
- School admin can create/update only own-school students.
- School admin cannot create NULL-school students, update to NULL school,
  create/update another school's students, or update NULL-school students.
- Guardian, driver, and anonymous contexts cannot write student roster data.
- Anonymous cannot read the protected roster.

## Guardian Visibility Coverage

The guardian script seeds and verifies:

- Guardian A.
- Guardian B.
- Guardian A active linked student.
- Guardian A inactive linked student.
- Unlinked same-tenant student.
- Cross-tenant student.
- Guardian B active linked student.

Assertions check exact returned student IDs, not just row counts. Guardian A
must receive exactly Guardian A's active linked student from the RPC and must
not receive inactive-link, unlinked, cross-tenant, or Guardian B rows. Guardian
B must receive exactly Guardian B's active linked student. Driver and tenant
admin contexts must receive no guardian RPC rows. Guardian A's
`student_guardians` SELECT policy must expose exactly Guardian A's own active
and inactive links, and hide Guardian B's link.

## Why Playwright Smoke Tests Are Not Enough

Playwright smoke tests verify UI behavior with mocked Supabase responses. They
do not execute real Postgres RLS policies, helper functions, or SECURITY
DEFINER RPC logic. These manual SQL tests exercise the actual database
authorization paths that mocks cannot validate.
