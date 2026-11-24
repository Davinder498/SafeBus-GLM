# Autonomous SafeBus engineering

Codex owns the implementation, tests, technical review, merge and verification
for authorized engineering tasks. It works on a feature branch, records
evidence in the PR and uses GitHub's normal merge with the exact reviewed
head SHA. Required checks gate merging. Codex diagnoses failures and reviews
the new commit after fixes. Status reports cover the result, test evidence,
release state and any remaining owner action.

## One-time GitHub owner settings

| Location | Setting |
|---|---|
| **Settings → Branches → main protection** or the active **Ruleset** | Require a pull request. Set **Required approving reviews** to **0** for routine engineering. Disable **Require review from Code Owners** and **Require approval of the most recent reviewable push** if enabled and blocking merges. Retain required CI and CodeQL checks, branch update protection and the ban on force pushes. Apply protections to administrators where available. |
| **Settings → Environments → recovery-capacity** | Create the environment. Under deployment branches and tags select **Selected branches and tags**, add a **Branch** rule for `main` only and turn off administrator bypass where available. Add the project credentials and variables described in [Recovery setup](../qa/recovery-before-merge.md). |
| **Settings → Secrets and variables → Actions → Variables** | Set the repository variable `SAFEBUS_RECOVERY_AUTOMATION_ACTOR_ID` to `219331323` for the verified linked `Davinder498` identity. Update it only if the approved automation identity changes. |
| **Settings → Environments → recovery-capacity → Deployment protection rules** | Clear **Required reviewers** for unattended Recovery runs after applying the branch and identity settings. Keeping reviewers makes the job pause for approval. |

The linked GitHub identity creates the PR and therefore cannot cast a
GitHub approving review on that PR. Technical approval is recorded in the PR
evidence and the merge uses GitHub's required checks. GitHub's optional
**Allow auto-merge** setting is unnecessary for the exact-SHA merge path.

The branch-triggered test carries no Recovery credentials. The main workflow
checks the source workflow, same repository, authorized actor, exact commit
and untouched workflow files. It checks the dedicated environment before
the hosted job can use Recovery credentials. The first live verification uses
the 10-bus synthetic profile.

## Production releases and spending

The shared `production` and `android-production` environments currently
have their own reviewers. This PR changes Recovery and routine engineering
merges. Live deployment still uses the existing protected workflows. For
unattended production deployment, first establish which releases the owner
authorizes, isolate those credentials from other production jobs, and verify
artifact provenance, health checks and rollback for that release path.
Continue to show production release and Android signing status separately
from PR and Recovery status.

Use the existing plans and approved Recovery project. Keep account upgrades,
new services and paid overages behind an explicit owner decision.
