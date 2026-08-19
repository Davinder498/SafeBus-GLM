# GitHub Actions Supply-Chain Controls

## Status

Implemented for review in Commercial Readiness Remediation 4. These controls
cover repository workflow dependencies only; they do not represent a complete
commercial security or software-supply-chain approval.

## Control

Every external GitHub Action is referenced by its full, immutable 40-character
commit SHA. A reviewed major-version comment remains beside each SHA so
Dependabot can identify the intended release line and propose future updates.

| Action | Reviewed release line | Pinned commit |
| --- | --- | --- |
| `actions/checkout` | `v7` | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | `v7` | `820762786026740c76f36085b0efc47a31fe5020` |
| `actions/setup-java` | `v5` | `b6effb05e454b25005698d916606bdc6ffcbf961` |
| `actions/upload-artifact` | `v7` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| `android-actions/setup-android` | `v4` | `40fd30fb8d7440372e1316f5d1809ec01dcd3699` |
| `github/codeql-action` | `v4` | `ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd` |
| `gitleaks/gitleaks-action` | `v3` | `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` |
| `gradle/actions/setup-gradle` | `v6` | `9c971963bec38e04b3d30dcc455b5382be2fdbfb` |
| `pnpm/action-setup` | `v6` | `0977fd99725f1db4007ccb2928dbb4e90d06cc86` |

The `github-actions` entry in `.github/dependabot.yml` checks these dependencies
weekly. Each Dependabot proposal must still pass normal review and all required
checks before a human approves the merge.

## Regression enforcement

`tests/release/security-config.test.mjs` discovers all YAML files in
`.github/workflows` and fails when an external `uses:` reference is not a full
lowercase SHA or lacks its major-version comment. This makes newly added
workflows subject to the same control without maintaining a separate filename
allowlist.

## Update procedure

1. Confirm the proposed commit belongs to the expected upstream action and
   reviewed release line.
2. Review the upstream release notes and the exact commit diff.
3. Keep the full SHA and adjacent major-version comment together.
4. Run the repository validation suite and allow all hosted workflow checks to
   complete.
5. Merge only after human approval.
