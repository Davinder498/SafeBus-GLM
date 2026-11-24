# Autonomous SafeBus engineering

Codex owns the implementation, tests, technical review, merge and verification
for authorized engineering tasks. It works on a feature branch, records
evidence in the PR and uses GitHub's normal merge with the exact reviewed
head SHA. Required checks gate merging. Codex diagnoses failures and reviews
the new commit after fixes. Codex requests human approval when required and
resumes after it is recorded. The request includes the exact change, test
result and approval link. Status reports cover the result, release state and
any remaining owner action.

## One-time GitHub owner settings

| Location | Setting |
|---|---|
| **Settings → Branches → main protection** or the active **Ruleset** | Retain required review, CI, CodeQL and branch protection settings. |
| **Settings → Environments → recovery-capacity** | Create the environment. Under deployment branches and tags select **Selected branches and tags**, add a **Branch** rule for `main` only and turn off administrator bypass where available. Add the project credentials and variables described in [Recovery setup](../qa/recovery-before-merge.md). |
| **Settings → Secrets and variables → Actions → Variables** | Set the repository variable `SAFEBUS_RECOVERY_AUTOMATION_ACTOR_ID` to `219331323` for the verified linked `Davinder498` identity. Update it only if the approved automation identity changes. |
| **Settings → Environments → recovery-capacity → Deployment protection rules** | Configure at least one **Required reviewer** and enable **Prevent self-review**. Use an authorized reviewer identity distinct from the GitHub identity starting the run. |

The linked GitHub identity creates the PR and therefore cannot cast a
GitHub approving review on that PR. When GitHub requires a review, the owner
can use an authorized reviewer identity other than the PR author. Codex
records technical review evidence and checks GitHub's required approvals
before merging.

The branch-triggered test carries no Recovery credentials. The main workflow
checks the source workflow, same repository, authorized actor, exact commit
and untouched workflow files. GitHub pauses the hosted job for a reviewer
before granting access to Recovery credentials. The first hosted verification
uses the 10-bus synthetic profile.

## Production releases and spending

The shared `production` and `android-production` environments currently
have their own reviewers. Codex prepares protected releases and asks for the
required approval when a workflow pauses. After approval it verifies the
deployed artifact and the applicable health checks. Production release and
Android signing status are tracked separately from PR and Recovery status.

Use the existing plans and approved Recovery project. Keep account upgrades,
new services and paid overages behind an explicit owner decision.
