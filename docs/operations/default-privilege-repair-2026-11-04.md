# Application authorization repair

Acceptance before implementation: school authority admins, school-scoped admins,
transportation admins, guardians, drivers and platform admins retain their current
explicit object grants, existing RLS/MFA policies, event/channel availability and
authority/school boundaries. Future objects require explicit client grants. Ten
private tables gain the required restrictive authenticated active-session guard;
no permissive policy or client grant is added. Existing users, data,
recipient choices and services are not changed. Drift or a missing privilege must
fail visibly. No real sign-ins, trip events or notifications are QA probes.

The protected authorization audit found unsafe defaults for future objects, not
new grants on the existing 220 application functions. Read-only reconciliation
confirmed `postgres` is the database owner but is not a superuser and cannot set
the managed `supabase_admin` role. It can set the implicit `pg_database_owner` role.

The bounded forward SQL removes client defaults from `postgres` in `public`,
including sequence UPDATE and table MAINTAIN, and removes built-in global PUBLIC
function execution for `postgres` and `pg_database_owner`. Existing object ACLs,
policies, role membership, service-role defaults and schema-specific provider
defaults remain pinned. Global function revocation also affects future functions
these two roles create outside public; explicit schema grants remain effective.

The later audit checks also found ten private tables without
`safebus_active_session`. All ten have owner-only grants, and five retain their
existing restrictive optional-MFA policies. The second pending migration adds
only the missing restrictive session policies. It neither grants client access
nor replaces an existing policy. The unchanged metadata hash excludes only these
ten named new policies, whose exact definitions are checked separately.

The protected release must verify the exact hosted before-state, rehearse both
forward and inverse SQL with final rollback, retain encrypted recovery before
installation, and independently verify the after-state. The forward SQL contains
only ALTER DEFAULT PRIVILEGES and ten CREATE POLICY statements; recovery reverses
the exact new policies and defaults. Inspected provider hooks do not send external
events for these commands. No migration chain replay or probe objects are needed.

`supabase_admin` retains its separate unsafe defaults until Supabase coordinates
that portion. The full authorization audit stays strict and is expected to fail
until those findings are resolved. A merged PR or application-default release
alone is not complete authorization hardening or launch approval. The combined
rollback-only rehearsal verified 26 repaired default findings and all ten new
session guards while retaining existing permissions, policies, roles and hooks.
