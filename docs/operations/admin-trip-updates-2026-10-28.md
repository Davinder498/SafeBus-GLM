# School authority administrator trip updates

The existing BusSafe project is the reviewed target. This forward change is
prepared and rollback-rehearsed, but it is not persistently installed. The
protected merge and production release gates still apply.

## Cause and scope

The hosted `notify_trip_audience` function fans trip starts and completions
out to linked guardians and the assigned driver, but its administrator branch
allows only exceptions. The separate inbox-insertion trigger also rejects those
two events for school authority, transportation and school administrators.
The active trip has one guardian and one driver `trip_started` row and no
administrator row. Existing administrator Trip updates preferences were
enabled; a preference cannot display an event that was never created.

The prepared migration adds `trip_started` and `trip_completed` to both
administrator gates. It preserves the existing source trigger, account/tenant/
school checks, personal in-app preferences, deduplication keys, assigned-driver
scope, guardian links and notification delivery policy. It does not send Android
push to administrators, rewrite old notifications, or replay the past trip.
New matching events will appear in each administrator's Trip updates inbox
when that person's in-app preference is enabled.

## Reconciliation and recovery

`config/pending/admin-trip-updates.json` pins the two hosted definitions,
owners, ACLs, exact before/after hashes and SQL digest. The forward SQL is
`supabase/migrations/pending/20261028090000_admin_trip_updates.sql`.
Its precondition fails if either hosted definition changes. The protected
release workflow captures exact before definitions as encrypted bounded
recovery, verifies it is retained, and only then permits an atomic install.
Use milestone `notifications` for the rehearsal and install workflow runs
after reviewed merge. Rehearsal runs in one rollback-only transaction.

The hosted rollback rehearsal compiled both new definitions with body checks
enabled, matched both expected after hashes, found no new notifications or
push/email jobs and changed no personal preferences. A separate read-only
transaction confirmed both original hashes remained installed afterward.
Embedded PostgreSQL generated actual trip start and completion events across
guardian, driver and all three administrator roles. It also checked other
school/authority exclusion and an administrator in-app opt-out. Browser smoke
checks the administrator Trip updates filter. These do not prove live device
delivery or a deployed client.

Administrator MFA remains required. Guardian and driver MFA remains optional,
with server-side enforcement after enrollment. No MFA bypass is part of this
change.
