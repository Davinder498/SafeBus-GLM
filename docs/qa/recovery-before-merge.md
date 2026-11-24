# Test capacity before merging

Use one branch under `capacity/recovery-*` for the tracking experiment. Run focused
tests locally during development. When a candidate is ready for hosted
measurement, push it and dispatch **Test Recovery capacity candidate** from
`main` with the branch name, its full commit SHA and a workload. The candidate
must descend from the main commit that dispatches the workflow. Rebase onto
current main after unrelated merges when needed.

GitHub checks the selected SHA and runs focused tests without credentials.
The environment review links to the exact candidate diff. Review the candidate
code, test harness and dependency changes before approving the hosted step.
This step checks out the exact SHA even if the branch moves, runs the bounded
synthetic workload and saves the result and cleanup status. Interpret it as
experimental evidence for that commit. The existing main-only release and
capacity workflows still govern release qualification.

## One-time GitHub setup

Create the `recovery-capacity` environment. Give it a deployment branch policy
with the single allowed branch `main`, required reviewers, and **Prevent
self-review**. Turn off administrator bypass. Use the existing authorized
reviewers for this Recovery workload. Configure these values for
`BusSafe-Recovery-20261011` in that environment only.

| Kind | Name | Value |
|---|---|---|
| Secret | `SAFEBUS_RECOVERY_EXPERIMENT_DATABASE_URL` | Recovery-only session-mode database connection |
| Secret | `SAFEBUS_RECOVERY_EXPERIMENT_AUTH_SECRET` | Recovery-only Supabase server key |
| Variable | `SAFEBUS_RECOVERY_EXPERIMENT_PUBLISHABLE_KEY` | Recovery publishable key |
| Variable | `SAFEBUS_RECOVERY_EXPERIMENT_DATABASE_CA_CERT` | CA certificate for that database connection |

The workflow rejects a missing review or branch policy and checks the
connection and Auth target before loading candidate code. Keep the values at
environment scope. Review any plan limits before expanding workloads. Current
profiles cover a 10-bus combined diagnostic and 100- and 500-bus GPS
comparisons. Use the 10-bus profile to verify the new workflow first.
The new workflow uses the existing concurrency group so fixture operations
do not overlap with the current Recovery workflows.
