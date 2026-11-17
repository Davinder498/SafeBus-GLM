# Recovery project capacity bootstrap

Status: prepared code; hosted schema import and fleet qualification not yet run.

The owner selected the existing Canadian recovery project instead of a new paid
branch. After the owner restarted it, read-only inspection confirmed no public
or private application relations/routines, Auth users, Storage buckets/objects,
Vault secrets or deployed Edge Functions. Security advisors returned no findings
on the empty project. It is Free/Nano, PostgreSQL 17.11, with max_connections 60.
These observations do not establish capacity or application readiness.

The source is production `ckrkfylsyihwouvesypm`; the only writable target is
`deladookciebwvqojhkv`. The approved source fingerprint is
`502e5769df192afe246c8c5d793839efd66052311a9555e5f7c904fc01d82857`.
The current source has 56 public and 34 private application tables. Source
catalog changes require baseline review rather than automatic acceptance.

## Bootstrap behavior

`Prepare isolated recovery capacity schema` uses the protected production
workflow environment because it reads production's schema. Credential-bearing
steps run only after exact-main validation, without application builds. Source
connections and native pg_dump use read-only transactions and the same exported
snapshot. No historical migrations are replayed.

The target must be empty; existing data/schema causes a stop, never a reset.
Native PostgreSQL 17 exports only public/safebus_private schema definitions.
The importer installs the four missing version-pinned extensions, then imports
inside one transaction. It compares application columns, relations, constraints,
indexes, policies, routines, grants, triggers, schema/type/sequence metadata and
schema-local defaults against the same source snapshot before committing.
Provider-side differences or unsupported definitions fail the rehearsal.

Install mode first rehearses and rolls back successfully, then performs the
same checks and commits. After parity is verified, it revokes schema USAGE from PUBLIC, anon, authenticated
and service_role and verifies those API roles cannot access either app schema.
It registers the target as staging, then verifies the committed catalog with only
those reviewed USAGE removals permitted, plus the environment identity. A fresh run refuses a nonempty
installed target; it is not a repair/reset tool. A verification failure after
commit is a failure requiring inspection, not automatic deletion.

Native dump timeout-disabling statements and its two psql restriction guards
are removed; arbitrary psql commands are rejected. SQL stays in process memory.
Only hashes, target/source identity, revision and scope evidence are retained.
Errors report a stage without printing SQL, credential URLs or provider errors.

## Role acceptance and deliberate exclusions

| Role                   | Acceptance for this schema-only milestone                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guardian               | Current RPC definitions, RLS and grants match the source; no copied identities, student records or test deliveries. Live login/access proof remains pending. |
| Driver                 | Ingest definitions/grants retained; no GPS writes or device registration performed.                                                                          |
| School authority admin | Existing authority-scoping definitions retained; no tenant records copied.                                                                                   |
| School-scoped admin    | Existing school-scoping definitions retained; no scope expansion.                                                                                            |
| Transportation admin   | Existing permissions retained; no assigned operational data copied.                                                                                          |
| Platform admin         | Existing application definitions retained; no privileged Auth identities copied.                                                                             |

The bootstrap does **not** copy Auth/Storage/Realtime provider schemas or policies,
global role/default-grant configuration, publications, cron schedules, provider
keys, endpoints, reference/configuration rows or users. Consequently it does not
claim complete runtime parity. Source function definitions can refer to provider
objects, but this step does not invoke them. Required reference rows and provider
security/configuration must be reviewed before synthetic users or jobs are added.
Keep the recovery Data API disabled and external providers disconnected during
bootstrap. No fixture writers or load runner are enabled by this workflow.

## Required protected connection settings

Existing production source settings remain unchanged. Add only these recovery
settings in GitHub's `production` environment:

- Secret `SAFEBUS_CAPACITY_DATABASE_URL`: the recovery project's PostgreSQL direct
  or **session pooler** connection URL, with the recovery password, database
  `postgres`, port 5432 and no query string. URI-encode password characters.
  A production URL, another project, transaction-pool port or missing password
  is rejected. Never paste this secret into chat or commit it.
- Variable `SAFEBUS_CAPACITY_DATABASE_CA_CERT`: the PEM CA certificate downloaded
  for the recovery database. Connections verify TLS; no insecure fallback.

The Supabase SQL connector does not provide a native pg_dump connection string,
and GitHub does not reveal saved secret values. These settings are required for
the protected native schema export/import and eventual multi-connection tests.
No account upgrade or new project charge is authorized by this workflow.

Dispatch on reviewed current main with its full SHA, confirmation
`PREPARE_RECOVERY_SCHEMA_ONLY`, and mode `install` (which includes rehearsal).
Approve the protected environment. Inspect both rehearse/install JSON artifacts
and verify the installed target before advancing. Hosted execution is still
pending until those checks actually succeed.

## Remaining capacity preparation

Review provider policies/pre-request session hooks, synthetic reference data,
Auth configuration, notification isolation and worker schedules before exposing
the target API. Prove role/tenant denials and simultaneous ingest/cache behavior
with real connections. Then cost and stage bounded synthetic traffic, measuring
actual quotas and generator throughput. Free/Nano resources are not certified
for 500, 5,000 or 10,000 buses.

## First hosted rehearsal and corrective handling

Run 44071222092 passed validation and connected with verified TLS to both
projects. It failed during schema import: PostgreSQL reported `permission denied
to change default privileges`. Read-only inspection confirmed zero application
tables afterward; installation did not run.

The schema-only dump includes public-schema default grants owned by
`supabase_admin`, which `postgres` cannot alter. The source and recovery project
already have identical provider-owned defaults. The importer now checks that
identity before importing and omits only the exact redundant provider GRANT
statements. Full post-import default-privilege comparison remains mandatory.
Function bodies are preserved during normalization.

The fresh recovery project's postgres-owned defaults also grant anon and
authenticated privileges that production has removed. Before creating objects,
the transaction revokes these inherited role defaults (including service_role);
the reviewed dump restores explicit object permissions and postgres defaults.
This avoids retaining accidental privileges on newly restored objects. Any
catalog mismatch still rolls back. Failure logs expose SQLSTATE, never raw SQL
or connection credentials. This correction is not evidence of a successful
hosted import or fleet capacity until the protected workflow passes.

## Catalog comparison correction after second rehearsal

Run 44075368562 reached catalog verification and rolled back. Read-only inspection
again found zero application tables. The previous error handler hid the differing
catalog section; it now emits an allowlisted section name alongside SQLSTATE.

Two comparison defects were reproduced using two isolated PGlite PostgreSQL
instances. Native pg_dump sets the target session search_path to empty, whereas
the source catalog was collected under its session default. PostgreSQL deparses
user-defined types and expressions differently under those settings. Bootstrap
catalog collection now uses the same transaction-local pg_catalog search path on
both sides and restores the caller's setting afterward. The existing production
fingerprint format and baseline validation remain unchanged.

Production also has three dropped attribute slots in
public.guardian_notification_delivery_policies. A dump/restore omits those slots.
The bootstrap comparison now compares live column order while retaining column
names, types, nullability, defaults, identity, generated and collation checks.
The database regression covers both differences and confirms that a changed
column constraint or added anonymous grant still fails verification. This is
local evidence for the correction, not a claim that the hosted import passed.
