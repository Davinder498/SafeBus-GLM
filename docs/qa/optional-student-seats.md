# Optional student seats

This milestone adds seats only. Student/guardian/driver/bus exports and QR export
enhancements are deferred to the next milestone.

## Behavior

- A seat is an optional positive PostgreSQL integer on a student bus assignment.
  Existing assignments remain unseated. Blank explicitly clears the seat.
- Both directions receive the same entered seat. When an existing group has
  different seats, the administrator must enter a seat or choose **Clear both seats**.
- A numbered seat is exclusive for overlapping inclusive date ranges on the
  same bus-route service. Different directions/services and non-overlapping dates
  can reuse it. Inactive/archived assignments do not reserve seats, and
  reactivation rechecks the exclusion constraint. Stops do not permit sharing.
- Known bus capacity limits seat numbers; unknown capacity permits any positive
  integer through 2,147,483,647. Zero capacity permits unseated assignments only.
- Current/future reservations prevent capacity reductions below a reserved seat.
  Historical assignments retain their seat labels. Service reparenting and
  reactivation also check capacity.
- Existing transportation write permissions are preserved. Drivers see seats only
  in their authorized active-trip manifest. Guardians see their linked students'
  current seats on the home screen, including web and native mobile.
- Seat-only updates do not send service-change notifications. Existing inserts
  and other transportation changes retain their notification behavior.

## Database and compatibility

Prepared migration:
`supabase/migrations/pending/20261017154816_optional_student_seat_assignment.sql`.

The partial GiST exclusion constraint uses `btree_gist`. Capacity writers and
numbered assignment writers synchronize on the bus row. These writes require
the API's default READ COMMITTED isolation; stronger snapshot isolation is
rejected to prevent an old snapshot from missing a committed reservation.
Exclusion constraints protect all callers, including direct writes and concurrent
reservations. Capacity/seat conflicts roll back the entire grouped RPC.

New authenticated RPCs are listed in
`config/pending/student-seat-authorization.json`. They have explicit audience
grants, retain tenant/session checks, and use the reconciled private helpers.
Existing RPC signatures remain available. Old clients' unrelated edits preserve
seats. The existing admin bus-workspace JSON projection gains `seat_number`.

Prepared TypeScript contracts extend `packages/types/src/database.ts`, following
the repository's existing forward-contract convention. The generated hosted
snapshot is deliberately unchanged until the protected database release.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`.
- `node --test tests/release/student-seats-postgres.test.mjs` runs the actual
  migration in embedded PostgreSQL with `btree_gist`, synthetic dependencies,
  simulated authorization helpers, RLS, and no network or hosted credentials.
  It covers optional/edit/clear/old-client persistence, real workspace projection,
  inclusive/open-ended overlaps, direction/service reuse, lifecycle changes,
  capacity, partial-save rollback, scoped reads, revoked-session behavior,
  grants, and competing reservation attempts. PGlite queues attempts in one
  backend; this is not a multi-session lock-scheduling test.
- Component tests cover blank seats, number validation, capacity, editing,
  clearing, mixed direction seats, and server conflict messages.
- Browser tests cover saved seats after page reload and mobile driver/guardian
  displays, alongside existing bus, route, and student workspace journeys.

## Protected release

No hosted migration or QA writer is authorized by this implementation. Leave the
active checksum manifest, historical migrations and security installation tip
unchanged. Do not replay pending work or provision an environment.

Before release, reconcile the actual column, constraint, trigger and routine
definitions; confirm `btree_gist` availability/operator-class schema; review
recovery evidence; and rehearse the reviewed change in a bounded rollback-only
transaction. Inspect all triggered notification/audit/realtime effects before
any hosted test writes. Any hosted verification must follow AGENTS.md's scoped
fixtures and preservation requirements.

The release rehearsal should exercise separate SQL sessions racing a seat claim
against a competing claim and a capacity reduction, with statement/lock timeouts.
Do not run uncontrolled load or external notifications as QA. Release the schema
before the new application build and regenerate the hosted types afterward.
For application rollback, the old RPCs continue to work; preserve seat data and
constraints rather than dropping the column. Human PR review, protected release
approval and merge approval remain required.
