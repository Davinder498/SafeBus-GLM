# Supabase support request draft: managed default privileges

**Optional technical-assistance route, not a launch/legal prerequisite (DL-023).**
Review effective access and app-controlled corrections first. This draft neither
establishes that provider assistance is the only safe solution nor waives a finding.

**Draft only. Not sent. No production change requested without an agreed window
and the customer's protected recovery/change approval.**

Subject: Supported hardening of public defaults owned by supabase_admin (PG17)

Project: BusSafe, reference `ckrkfylsyihwouvesypm`, Canada Central.
Observed PostgreSQL server version: 17.6.

Our prelaunch authorization gate detected automatic grants to `anon` and
`authenticated` on future objects in `public`. Catalog-only read-only inspection
shows the following defaults for BOTH `postgres` and `supabase_admin`:

- Tables: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN.
- Sequences: SELECT, UPDATE, USAGE.
- Functions: EXECUTE.

No global default ACL rows are present, so PostgreSQL also supplies built-in
PUBLIC EXECUTE for new functions. Roles currently able to create in `public`
include `postgres`, `supabase_admin` and `pg_database_owner`.

Our database connection is `postgres`, with `rolsuper=false` and
`pg_has_role('postgres','supabase_admin','MEMBER')=false`. We understand that this
prevents it from changing the managed role's defaults. We do not want to grant
superuser access, modify reserved-role memberships, replay historic migrations,
or grant broad client access to work around this.

Please confirm:

1. The supported way to revoke the `public` schema's client defaults owned by
   `supabase_admin`, preserving provider operation and required explicit grants.
   Can Supabase carry out this narrow change under an agreed change window?
2. Whether global PUBLIC function EXECUTE can safely be revoked for the managed
   creator, and which future provider functions need explicit replacement grants.
   A schema-only REVOKE cannot remove PostgreSQL's built-in global grant.
3. Whether platform maintenance recreates these defaults, and how we can retain
   the agreed security posture across updates without changing other managed
   schemas' default grants.
4. Whether there is a supported project setting or provider-assisted procedure
   covering existing projects and all relevant creator roles, including the
   implicit database-owner role. Please provide the exact scope and statements
   for review before any change is scheduled.

Existing application objects have separately reviewed explicit grants and RLS;
this finding concerns future-object defaults. We will retain before/after
catalog evidence, rehearsed bounded recovery and the protected change record.
This does not establish a full database restore.
Please do not make an uncoordinated production change, because that would fail
our drift gate and bypass our protected approval process.

We can provide a redacted default-ACL listing. No database password, API secret,
Auth rows, customer rows, recovery key or backup archive is needed in this ticket.

## Fresh reconciliation and proposed provider scope, 2026-11-04

The protected read-only authorization audit failed on main
`0fe784fab749c57f89437db61e8e1f372e8f72ee`, run
https://github.com/Davinder498/SafeBus-GLM/actions/runs/41876390993.
Fresh catalog inspection still shows PostgreSQL 17.6, no global default ACL rows,
and the ownership/membership limits described above.

We rehearsed the application-controlled changes for `postgres` and the implicit
`pg_database_owner` role in one rollback-only transaction. They reduce findings
from 51 to 25, all owned by `supabase_admin`. Forward and inverse SQL restored
the exact snapshot; a separate read-only check confirmed final rollback. No
persistent change has yet been applied by that rehearsal. Existing object ACLs,
RLS, role memberships, DDL hooks and all provider schema-specific defaults stayed
unchanged. See `default-privilege-rehearsal-2026-11-04.json`.

The same bounded rehearsal now also covers ten new restrictive active-session
policies on owner-only private tables. Existing policies, including MFA guards,
are preserved. This application-owned addition does not change the managed-role
request below, and the full authorization audit is not being waived.

Please review this exact remaining managed-role proposal and coordinate its
rehearsal, recovery, approved application and verification with us:

```sql
alter default privileges for role supabase_admin
  revoke execute on functions from public;
alter default privileges for role supabase_admin in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke execute on functions from public, anon, authenticated;
```

This preserves service-role defaults and existing object grants. The global
function change also affects future provider functions outside `public` unless
an explicit schema default grants access. Please confirm required provider
grants and maintenance behavior before applying it; do not change managed role
membership or run an unreviewed broad revoke on existing objects. We will rerun
the unchanged full authorization audit after both portions are verified.
