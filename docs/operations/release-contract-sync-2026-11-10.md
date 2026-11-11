# Hosted release contract synchronization

Engineering release 42917525627 passed immutable migration verification, observed
metadata isolation, schema fingerprint comparison and schema preflight. Its
failure was stale generated database types. The earlier connector-derived
fingerprint warning did not reproduce through the protected direct connection;
no baseline fingerprint update is required.

Protected read-only type refresh 42925510442 generated the committed type changes.
They add hosted agreement, disposal and driver-action RPC definitions. Preserve
the generator output exactly; these definitions do not grant execution rights.

The authorization inventory now includes the thirteen authenticated district and
participant agreement functions from the reviewed November 7/8 migrations and
the service-only district_agreement_billing_allowed(uuid). Live read-only catalog
inspection confirms no anonymous execution, authenticated access for the thirteen
user functions, and service access consistent with the existing migration/default
grant model. Role, tenant and session enforcement remains inside the RPCs.
The GPS-history removal migration explicitly dropped retention_archive_work;
remove that obsolete service entry rather than restoring its execution grant.

No database changes, baseline rewrites or audit bypasses are part of this change.
The complete protected authorization audit and canonical types check must pass
before deployment. Local focused authorization tests and typecheck are recorded
in the PR; CI supplies full validation. Human merge and environment review remain.

PR CI also exposed a historical-reconciliation test that compared the current
agreement APIs with an older frozen migration. Exclude the fourteen separately
observed agreement signatures when reconstructing that historical surface, just
as the test already does for subsequent tracking, offline and retention APIs.
The migration stays immutable and the current authorization test still requires
all observed agreement functions. Both affected suites pass: 26 tests total.
