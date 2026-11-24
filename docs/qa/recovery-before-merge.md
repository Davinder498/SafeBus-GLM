# Test capacity before merging

Use one branch under `capacity/recovery-*` for the tracking experiment. Run focused
tests locally during development. Once the owner enables the authorized GitHub
identity, push the reviewed commit to a branch ending in `-run-10`, `-run-100` or
`-run-500` to request the corresponding profile. Use a regular experiment
branch for intermediate work. The trusted workflow runs from `main`, validates
the requested commit and measures it only after the focused checks pass.

The manual workflow also accepts a branch, exact SHA and profile. With the
automatic identity unset it requires an independent environment reviewer.
Before requesting either kind of run, review code, dependencies and test
scope. The commit must descend from the dispatcher on `main`. Automatic runs
require workflow files to match that dispatcher. The measurement uses the
verified SHA if the branch later moves. Results and cleanup evidence belong
to that commit. The protected release workflows govern release qualification.

## One-time GitHub setup

Create the `recovery-capacity` environment with the single allowed deployment
branch `main`. Turn off administrator bypass where the setting is available.
For attended runs, add an authorized reviewer and turn on **Prevent
self-review**. For unattended runs, configure the approved repository actor
as described in [autonomous engineering](../governance/autonomous-engineering.md).
Configure these values for `BusSafe-Recovery-20261011` in this environment only.

| Kind | Name | Value |
|---|---|---|
| Secret | `SAFEBUS_RECOVERY_EXPERIMENT_DATABASE_URL` | Recovery-only session-mode database connection |
| Secret | `SAFEBUS_RECOVERY_EXPERIMENT_AUTH_SECRET` | Recovery-only Supabase server key |
| Variable | `SAFEBUS_RECOVERY_EXPERIMENT_PUBLISHABLE_KEY` | Recovery publishable key |
| Variable | `SAFEBUS_RECOVERY_EXPERIMENT_DATABASE_CA_CERT` | CA certificate for that database connection |

The workflow requires the configured branch policy and checks the
connection and Auth target before loading candidate code. Keep the values at
environment scope. Review any plan limits before expanding workloads. Current
profiles cover a 10-bus combined diagnostic and 100- and 500-bus GPS
comparisons. Use the 10-bus profile to verify the new workflow first.
Hosted measurements use the existing concurrency group so fixture operations
do not overlap with the current Recovery workflows. Request a new run rather
than retrying a previous Actions run.
