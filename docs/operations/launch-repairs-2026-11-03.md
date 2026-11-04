# Launch repair acceptance and rollout

Baseline: main `e2d94169afe0c6a08b8b2197da96f5e1e61475f9`.

Work proceeds one milestone at a time on a feature branch. An implementation or
passing local test is not proof of production deployment or launch approval.

| Role | Required permitted behavior | Scope and failure behavior |
| --- | --- | --- |
| Platform admin | Inspect retention previews after MFA and recent authentication | Other roles cannot run retention; deletion remains disabled pending its separate recorded approval. |
| School authority admin | Manage current and scheduled transport assignments; see complete scoped detail data | Preserve authority boundaries, mandatory MFA, subscription rules and actionable errors. |
| School-scoped admin | No retired school-admin portal or restored legacy role access | Deny unsupported role access; preserve any supported scoped administrator restrictions. |
| Transportation admin | Manage only operations permitted by the existing authorization model | Do not introduce a new role or broaden school/authority access. |
| Guardian | View linked students, recipient preferences and available app downloads | Never expose a full roster; preserve opt-outs, device permission and optional MFA. |
| Driver | Start an eligible authority bus by QR; stop location locally when offline | Never restart collection to replay a server action; retain session and device boundaries. |

## Milestone 1: retention release path

Before: eight retention previews fail with ambiguous-column error `42702`; the
existing guarded correction has regression coverage but no selectable protected
operational release target.

After implementation: the protected workflow accepts `retention`, checks the
exact observed definition, rehearses the correction and restoration, saves
an encrypted recovery artifact, and verifies the resulting function owner,
permissions and definition. The correction changes neither retention periods,
control approvals, schedules nor deletion availability.

Acceptance: embedded PostgreSQL reproduces all eight failures and verifies fixed
previews, authorization failures, unchanged privileges, disabled deletion and
restoration. Release configuration must match the migration digest and the
actual PostgreSQL-normalized before/after definitions. Production installation
requires reviewed main and the existing protected production environment.

Live baseline reconfirmed on November 4 UTC: private retention function normalized
MD5 `2e47fad329f75031f5c7227b65d38b4b`; owner `postgres`; execute grants to
`postgres`, `authenticated`, and `service_role`. No production change made.
