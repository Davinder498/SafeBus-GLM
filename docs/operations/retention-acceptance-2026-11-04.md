# Retention installation and bounded acceptance

Acceptance defined before implementation: school authority admins,
transportation admins, guardians and drivers gain no retention controls or data
access. The retired school administrator stays denied. Platform retention keeps
its existing MFA/recent-auth and destructive-execution approval checks. Service
execution remains scoped to the existing endpoint. No role, retention period,
recipient choice, notification channel or customer record changes.

The existing correction already has reviewed before/after function fingerprints,
installation/restoration rehearsal and encrypted bounded recovery. Protected run
41914886601 was dispatched on reviewed main
`4e3e831657e6761f34a20ca9a488a1024b447d1e`. At preparation of this change, validation
passed and production installation was waiting for the required reviewer. This
document is not proof of installation. Destructive retention remains disabled.

## Verification gap and correction

Previously, the operational release verified the installed definition and ACLs
but did not execute the retention policy branches. Now retention verification
also calls each of the twelve reviewed policies with the literal dry-run flag
`true`, within one bounded repeatable-read transaction that always rolls back.
It checks every returned policy, completion status, dry-run flag and error code,
then independently verifies that the returned run IDs were not retained.
The final check rechecks the installed definition and disabled deletion control.

Before execution it requires the reviewed installed fingerprint, the unchanged
disabled deletion control, service execution permission, exactly the expected
active policies and no user-defined triggers on either verification-log table.
Missing policies, newly added triggers, definition drift, changed deletion
controls or any failed policy stop verification visibly. It never disables a
trigger, broadens permissions or commits verification writes. Only policy names
and aggregate eligible-row counts enter sanitized evidence.

The production definitions of the dry-run branches and log-table triggers were
inspected read-only first. Dry-run branches count existing records and write
only retention/audit logs; both log tables currently have no user-defined
triggers. The function's transaction-local retention flag and service identity
are cleared by rollback. No customer fixture is created and no notification is
sent. This checks dry-run correctness, not approval to execute deletion.
Compatible log-table locks prevent trigger DDL from racing the safety inspection;
normal log inserts remain possible, and lock acquisition has a one-second timeout.

The existing protected main/recovery/reviewer controls remain. After this source
change is reviewed and merged, running the retention install workflow again is
safe for an already installed correction: it observes that state and exercises
the bounded acceptance check without replaying the migration. A scheduled
successful batch later provides separate persistent operational evidence.

## Validation

The embedded PostgreSQL tests cover all twelve policy calls and rollback, a
mid-batch failure that rolls back earlier successful writes, restoration of the
caller role, disabled-deletion enforcement, definition drift, unexpected policy
and log-trigger rejection. The earlier correction tests still reproduce the
eight original 42702 failures and verify the corrected qualification and guards.

Full source validation and production acceptance must be reported separately.
An open PR, a successful local test or a queued protected run is not a completed
live repair. No other launch approval or physical-device claim is made here.
