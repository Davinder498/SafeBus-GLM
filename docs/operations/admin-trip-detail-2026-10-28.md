# Consolidated trips and trip detail

This milestone replaces duplicate admin trip lists with one paginated list on
Overview, Live Operations and All trips. The shared list defaults to all service
dates and sorts active/paused trips first. Every View link uses the trip UUID;
filters and page are retained in the return URL. The detail page contains a
trip-specific route map and ordered service line, available assignments,
recorded student events, dispatch status and existing notes/evidence.

The support website link/input/review value is removed throughout support UI;
stored fields and mutation contracts are retained. Admin header/body width caps
and outer admin page caps are removed. Recipient/public/native layout widths
are unchanged; shared support cards also lose their website link as requested.

## Acceptance by role

- School authority admin: view own authority trips, stops, permitted students,
  recorded pickup/drop-off events and existing authorized notes/dispatch actions.
- Transportation admin: the same read behavior within the authority, retaining
  existing action permissions.
- School-scoped admin: route school must match; student school must also match,
  including event-only students. Other schools' identities/events are excluded.
- Platform admin: receives the wider admin shell; no authority trip endpoint
  access is added.
- Guardian: no admin trip-list/detail/event-table access. Existing linked-student
  visibility, channels, recipient choices and optional MFA are unchanged.
- Driver: no admin trip-list/detail/event-table access. Existing own/assigned
  trips, manifests, event recording, recipient choices and optional MFA remain.

Both RPCs require an active authority/account/session and verified administrator
MFA. They run as the caller, with RLS plus explicit authority/school predicates.
There is no service-role frontend or SECURITY DEFINER addition. Student events
receive SELECT on six necessary columns and one authenticated administrator
policy; anonymous access and all writes remain unavailable. Existing restrictive
session/MFA policies remain. No notification event or delivery channel is added.

Assigned students and recorded travel are distinct. Historical assignments are
available service-date records, not frozen rosters. Event-only students remain
visible after reassignment. Current stop definitions and schedules carry an
explicit historical limitation. Saved trip geometry is preferred; fallback to a
current published shape is labelled. Completed/cancelled trips never return a
current bus location. GPS progress is an estimate, never a boarding/visit event;
expired, offline, failed-refresh or unverified positions are hidden.

## Reconciliation and protected release

Target is the existing production-designated BusSafe project. The pending SQL
adds two read-only RPCs, one scoped event policy and six column permissions;
it performs no record writes, trigger changes, event sends or migration replay.
The reviewed manifest binds SQL SHA-256, eight function definition hashes/ACLs,
89 affected-table policies and the six column permissions. The new function and
policy absence is an explicit baseline. Unexpected/partial adoption fails closed.

A bounded hosted transaction compiled the SQL against actual PostGIS and ETA
functions and successfully called list/detail under an existing administrator's
transaction-local session/claims, then rolled back. No synthetic hosted accounts
or fixtures were created. Embedded PostgreSQL supplies other role cases.
See the adjacent QA JSON for the exact SQL digest and observation-only results.

After human merge review, use **Release operational fix**, milestone `trips`,
on the exact reviewed current main SHA. Run `rehearse` with
`REHEARSE_OPERATIONAL_FIX`, then `install` with `INSTALL_OPERATIONAL_FIX` through
the protected production environment. The existing workflow checks TLS, target,
deployment lock, drift, rollback and recipient-data stability; encrypts bounded
recovery; uploads recovery before installation; and verifies installed hashes,
ACLs, policies and column permissions. Its restoration SQL removes newly added
objects and restores the original column permissions without CASCADE.

Ship the matching web artifact only with the database adoption, through the
existing protected web release. Missing RPCs surface a platform database-update
error with retry; they do not silently omit features or use an insecure fallback.
An open PR and rollback rehearsal are not a persistent installation or live
browser verification. After release, verify authorized list/detail/back navigation
and map configuration read-only, without announcements or external QA sends.
