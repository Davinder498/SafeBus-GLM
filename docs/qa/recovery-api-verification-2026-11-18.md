# Recovery API and private-channel verification

Status: prepared; hosted execution pending. Target: BusSafe-Recovery-20261011
(`deladookciebwvqojhkv`) only. Production remains untouched.

## Approved cleanup exception

The owner approved the following recovery-only exception after review of the
hosted deletion guards: close application access first; lock profiles and tenants;
verify every profile belongs to this run's exact Auth metadata marker and one of
its seven exact synthetic email addresses; verify each tenant ID AND name AND demo
type. Temporarily disable only `complete_disposal_guard` and
`protect_final_tenant_admin_delete` on profiles within that locked transaction.
Delete scoped participant requirements and profiles, restore both guards, remove
scoped tenant requirements/tenants, verify empty tables and enabled guards, then
commit. Any failure rolls back the deletion and trigger changes together. Auth
accounts are subsequently deleted through Auth Admin, without deleting audit logs.
This is not a production disposal procedure or a general permission to disable RLS,
retention, MFA, session checks, or triggers.

The runner rehearses this exact cleanup with ROLLBACK before granting authenticated
schema access. It never grants anon or service_role schema usage. Existing RLS,
function/table privileges, API pre-request hook and Realtime policies stay intact.
It verifies the installed five-policy catalog and API hook before opening access.
The workflow requires reviewed current main, existing protected production GitHub
environment approval, recovery-only database URL/CA and recovery API keys already
used by the successful Auth check. Dispatch `check-recovery-api.yml` with full
current main SHA and `CHECK_RECOVERY_API`.

## Acceptance matrix

| Identity                                 | API tenant scope        | MFA                       | Private channels                            |
| ---------------------------------------- | ----------------------- | ------------------------- | ------------------------------------------- |
| Authority A administrator                | A only                  | AAL1 denied, AAL2 allowed | Own notification and A tenant topics        |
| Authority A transportation administrator | A only                  | AAL1 denied, AAL2 allowed | Own notification and A tenant topics        |
| Authority A driver                       | A only                  | Unenrolled AAL1 allowed   | Own notification topic; tenant topic denied |
| Authority A guardian                     | A only                  | Unenrolled AAL1 allowed   | Own notification topic; tenant topic denied |
| Platform administrator                   | A and B                 | AAL1 denied, AAL2 allowed | Own notification topic                      |
| Authority B administrator                | B only                  | AAL1 denied, AAL2 allowed | Own notification and B tenant topics        |
| Authority B guardian                     | B only                  | Unenrolled AAL1 allowed   | Own notification topic; tenant topic denied |
| Retired school administrator             | Profile creation denied | Not applicable            | Not provisioned                             |

Every identity must see its own profile; non-platform identities must not see
another tenant's profiles. Direct foreign tenant filters must return no rows.
Every allowed channel must deliver a unique server-originated synthetic payload.
Other identities' notification topics and other authorities' tenant topics must
reject the join with an authorization error; timeout/transport failure is not a
passing denial. Expired sessions and logged-out sessions retaining a signed JWT
must be denied by HTTP and by a new private-channel join.

No real notifications, push, email, billing, maps or jobs are invoked. The probe
uses `realtime.send` directly with a nonce on synthetic topics, not recipient
notification delivery. No customer data is copied. The public signup setting must
remain disabled. Initial users, sessions, profiles, tenants, jobs, Vault secrets
and Storage objects must be empty; custom Auth user/session triggers are rejected.

## Failure handling and limits

Normal failure closes application access before cleanup. If the process is killed,
its connection drops, or cleanup fails, do not rerun over leftovers or bypass the
empty-baseline guard. Inspect that exact workflow run, restore schema quarantine,
verify the two deletion guards, and recover only that run's scoped fixtures. The
protected workflow concurrency and schema advisory lock serialize these runners;
they do not prevent an unrelated operator from editing the target.

Passing this check establishes the matrix above, not shared-bus assignment
permissions, existing-socket revocation latency, trip/GPS correctness, recipient
notification delivery, application onboarding, or capacity. Those remain separate
stages. Parent map concurrency and notification recipients are separate workloads.

Local regression tests execute cleanup SQL in PostgreSQL (PGlite): successful
rehearsal/cleanup, production identity rejection, exposed-schema rejection, foreign
profile/tenant rejection, disabled guard rejection, and transactional rollback
when deletion fails after profiles have been removed. These do not prove hosted
API/Realtime behavior; only the protected run can supply that evidence.

## Hosted failures and corrective verification

Run 44207149234 attempt 1 stopped at the first HTTP role check because the managed
Recovery Data API was disabled (HTTP 503). With owner approval, the Data API was
enabled with only `public` exposed; schema USAGE remains revoked outside this
protected runner. No private schema was exposed through PostgREST.

Attempt 2 passed the first administrator's HTTP scope and MFA checks, then failed
at Realtime. Provider logs recorded `MissingPartition` while the first connection
initialized managed `realtime.messages` partitions and replication. Read-only
inspection subsequently confirmed the current-day partition and surrounding days.
Auth users, profiles and tenants were empty and application schema access was
revoked after cleanup. This is not a completed seven-role verification.

The runner now reports allowlisted local failure codes and individual channel
substeps without logging provider responses, topics, tokens or credentials. Only
an explicit missing-partition channel error gets up to two bounded retries (1.5
and 3 seconds), with channel removal after each attempt. Authorization mismatches,
unknown transport errors, subscription timeouts and delivery timeouts still fail
immediately. Managed partitions are never manually created or modified by the
runner. Tests cover recovery, exhausted retries, secret redaction, and the failures
that must never retry. Hosted verification remains pending the corrected run.

Run 44211279000 then joined the first notification channel, but its one probe was
stored at 2026-11-18 05:12:39.978039 UTC before the managed replication slot reached
its consistent point and began streaming at 05:12:40.189 UTC. The delivery timeout
was not an authorization rejection or a failed insert. Cleanup again left zero
Auth users, profiles and tenants and revoked application schema access.

Before each allowed-channel probe, the runner now checks that the managed logical
broadcast slot belongs to the current database, is active with non-null restart
and confirmed-flush LSNs, and has a replication sender in `streaming` state. It
waits at most 40 checks spaced 500 ms apart (each SQL call retains its existing
statement timeout); no probe is sent if readiness fails. It then sends exactly
one nonce and verifies the matching private broadcast row was stored, because
`realtime.send` can swallow insertion errors into warnings. Actual receipt is still
required within the unchanged eight-second delivery deadline. No delivery retry,
manual slot creation, provider restart, permission changes or production mutation
is introduced. Local regressions cover cold startup, readiness exhaustion and
swallowed inserts; hosted end-to-end verification still requires the protected run.
