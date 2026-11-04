# BusSafe Postgres maintenance — 2026-11-04

## Verified state and next protected step

BusSafe (`ckrkfylsyihwouvesypm`, Canada Central) remains on platform Postgres
17.6.1.155. The project dashboard offers 17.11.0.011. Its confirmation dialog
warns that every service can be offline for up to one hour, the disk will be
right-sized, and downgrade to the old version is unavailable. No upgrade was
submitted from the dashboard.

The next reviewed step is `Inspect Postgres upgrade readiness`, dispatched from
current main with its full SHA and `INSPECT_POSTGRES_UPGRADE`. It reuses the
protected production environment and existing access token. It calls only the
provider eligibility GET, retains sanitized prerequisite counts and version
identifiers, and cannot initiate an upgrade. A successful inspection means
observation completed; inspect `providerChecksClear` separately. Missing provider
fields fail closed. Object names, response bodies and tokens are not artifacts.

Provider checks are advisory prerequisites, never launch or maintenance approval.
Only GA PostgreSQL 17 targets at 17.11 or later qualify for this preflight.
An absent compatible target, warning, unsupported extension, custom internal
object, proposed dropped object or validation error prevents a clear result.
Do not drop objects or loosen permissions to obtain eligibility.

## Before and after acceptance

Before repair, database Alberta local-time conversion differs from the app's
pinned timezone rules. After the supported upgrade, test both the engine/platform
version and Edmonton conversion for winter and summer dates against the pinned
application rules. Stored instants must remain unchanged. Preserve tenant RLS,
API grants, private schemas, MFA and recipient notification consent.

School authority admins, school-scoped admins, transportation admins, guardians,
drivers and platform admins retain their current permissions. During maintenance,
services can be unavailable; durable mobile actions must retain their queue rather
than claim server success. After maintenance, each role must reconnect and load
only its authorized data. This document does not claim those live journeys passed.

Before a separately reviewed upgrade implementation: retain fresh encrypted
whole-database recovery evidence compatible with the installed operational and
authorization repairs; reconcile current catalog fingerprints without accepting
unknown drift; bind the exact offered target; and record the maintenance window.
The existing bounded retention function recovery artifact alone is insufficient
for a platform upgrade. Keep required production reviewers. Do not automatically
retry an uncertain upgrade request. Confirm provider status before any new action.

After upgrade, check service health, stored data/catalog invariants, authorization
inventory, retention deletion remaining disabled, corrected timezone conversions
and the scoped application journeys. A full restore exercise is not introduced
as an additional launch prerequisite. No paid subscription is authorized here.

## Retention repair now installed

Protected run 41914886601 completed successfully on reviewed main 4e3e831.
Fresh read-only inspection confirmed the corrected function MD5
`0bd79a388362468846db861d3bf86e92` and destructive deletion disabled. Encrypted
recovery and outcome artifacts were retained by that run. The subsequent all-12
policy rollback-only acceptance was dispatched as run 41919312941 on merged
PR #373 main `bd8df6ea8e6b625e207382b018fd780b88d55b52`; completion is not
asserted until its protected verification succeeds.

## Provider references

- https://supabase.com/docs/reference/api/v1-get-postgres-upgrade-eligibility
- https://supabase.com/docs/reference/api/v1-upgrade-postgres-version
- https://supabase.com/docs/guides/platform/upgrading
- https://supabase.com/changelog/tzdata-local-time-vancouver-edmonton-casablanca
