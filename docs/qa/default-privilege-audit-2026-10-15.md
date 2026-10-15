# Production default-privilege audit findings

**Status: confirmed release blocker; no corrective production writes performed.**

Protected read-only authorization audit
[38765670022](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38765670022)
failed on `public` schema defaults after the successful observed registration.
The failure does not invalidate the recorded observation: those defaults were
already present in the pinned catalog. It means the observed state is not yet an
acceptable authorization baseline for release.

## Confirmed catalog facts

Separate bounded catalog-only transactions used `BEGIN TRANSACTION READ ONLY`,
15-second statement and 3-second lock timeouts, and final `ROLLBACK`. No probe
objects, Auth accounts or customer records were created or changed.

| Object creator   | Schema   | New table client defaults | New sequence client defaults | New function client defaults |
| ---------------- | -------- | ------------------------- | ---------------------------- | ---------------------------- |
| `postgres`       | `public` | All eight PG17 privileges | SELECT, UPDATE, USAGE        | EXECUTE                      |
| `supabase_admin` | `public` | All eight PG17 privileges | SELECT, UPDATE, USAGE        | EXECUTE                      |

Both `anon` and `authenticated` receive these explicit defaults. Table privileges
include TRUNCATE, REFERENCES, TRIGGER and MAINTAIN as well as normal DML. Existing
service-role defaults are also present and are outside the proposed client
revocations. Other provider-managed schemas are outside this audit's scope.

The initial audit reported **48 explicit unsafe grant entries**. Its old query
missed global defaults and PostgreSQL's implicit function grant when no global
`pg_default_acl` row exists. The corrected read-only query reports **51 entries**:
the same 48 plus implicit global PUBLIC function EXECUTE for `postgres`,
`supabase_admin` and `pg_database_owner`. All three currently have CREATE in
`public`. Grant recipients inherited by client roles are checked as well.

The connected `postgres` account has `rolsuper=false` and is **not** a member of
`supabase_admin`; that managed role has `rolsuper=true`. PostgreSQL requires
appropriate role membership or superuser privileges to change another role's
defaults. No attempt to escalate privileges or modify reserved roles was made.

The relevant statements in historical migration
`0089_authorization_surface_hardening.sql` do not prove they ran. That file is
one of the 122 frozen historical inputs. Inspection confirms that the three
actually installed migrations, 0123, 0122 and 0124, do not alter default ACLs.
Replaying 0089 would also attempt unrelated changes and is not a valid fix.

## Audit improvement and verification

`scripts/lib/default-privilege-audit.mjs` checks schema defaults plus the global
ACL for creators able to create in `public` and owners of its explicit defaults.
When a global row is absent, `acldefault` supplies the actual built-in behavior.
Diagnostics identify creator, global/schema scope, object type, recipient and
privilege. No owner exemption or warning-only conversion was introduced.
The standalone schema preflight also uses repeatable-read isolation with local
statement/lock timeouts before inspecting the registered baseline.

Owned in-memory PostgreSQL tests execute real default-grant changes and prove:

- absent global rows still grant PUBLIC function execution;
- a schema-only REVOKE cannot cancel a global grant;
- both creator roles and PostgreSQL MAINTAIN are covered;
- inherited global client grants are rejected;
- unrelated provider-schema/service-role defaults are excluded;
- changing defaults does not retroactively change existing functions.

The exact corrected query was also executed read-only against production and
returned the 51 findings above. The complete authorization workflow has not
passed: the failing run stopped before the later session-hook and Data API
checks. Its earlier RPC allowlists and existing-object checks passed.

Local validation passed: `pnpm typecheck`, `pnpm lint`, `pnpm build`,
`pnpm test` (382 web + 2 mobile + 338 release/contract tests = 722), and
`pnpm migrations:verify` (125 immutable files). App checks used valid Turbo
cache results; the release/contract PostgreSQL tests executed locally.
The new workflow parsed successfully and its inline JavaScript passed syntax
checking; the protected workflow has not been run from this branch.

## Required forward correction

1. Obtain Supabase's supported procedure for the managed-owner defaults and assess
   the effect of global function revocation on future provider-created routines.
   A [support request draft](../operations/supabase-default-privilege-support-request.md)
   is ready; it has not been sent.
2. Review the exact SQL and any required provider exceptions. Revoke unsafe
   schema client defaults for each applicable creator; global PUBLIC function
   execution requires a global revocation, not an `IN SCHEMA` revocation.
   Required future APIs must receive explicit grants in their reviewed migration.
3. Prepare a protected forward-security transition with immutable before/after
   fingerprints and actual execution provenance. Preserve the original observed
   baseline and three original installation records; do not fabricate an
   application deployment. The existing generic deployment intentionally refuses
   pending migrations in the single-production setup.
4. Extend encrypted export validation to the exact adopted state, capture a fresh
   backup including the new private registration metadata, fully restore and
   verify it, and obtain owner/offsite acceptance. The prior backup was captured
   before registration; the old exporter rejects adopted sources. Its earlier
   receipt must not be reused as proof of restoring the current metadata.
5. Rehearse the reviewed correction in a bounded rollback-only transaction, then
   obtain the protected approval for persistence. Run independent before/after
   catalog comparisons and the full authorization, drift, preflight and canonical
   types checks. Keep R1 open until these and runtime acceptance pass.

## Primary references

- [PostgreSQL 17 ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html):
  creator-role membership, global plus schema semantics and built-in PUBLIC EXECUTE.
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api):
  platform defaults and explicit grants alongside RLS.
- [Supabase inherited-privilege troubleshooting](https://supabase.com/docs/guides/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted-ddaa1c):
  global PUBLIC function revocation and effective inherited grants.
