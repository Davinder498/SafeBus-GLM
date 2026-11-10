# Engineering release CI evidence

The prelaunch engineering publisher must deploy only the exact reviewed current
`main` commit, after its CI and security checks succeed. Human merge review,
protected production approval, credential isolation, schema preflight, recovery,
artifact verification and commercial launch gates remain separate requirements.

## November 10, 2026 release failure

Release run `42825515087` targeted merged PR 431 commit
`1e62db1f19f90a6818a7bd000595db853a0df71a`. Its credential-free validation passed,
but `release-engineering-artifact.mjs checks` rejected the commit with
`ENGINEERING_RELEASE_CI_NOT_SUCCESSFUL`. Hosted schema preflight, artifact build
and production publication were skipped. This run did not deploy the home fix.

The expected-check list incorrectly required both the actual CodeQL analysis job
and a separate Advanced Security `CodeQL` summary. Observed main had eight
successful workflow checks, including `CodeQL JavaScript and TypeScript`, but no
summary. The PR head had the additional summary from GitHub Advanced Security.
Tests built their entire fixture from the expected list, so they missed this
real difference between main and PR evidence.

## Required evidence

Every required check must have the exact release SHA, be completed successfully,
and originate from the observed official GitHub Actions app (ID 15368,
`github-actions`). The newest run by check ID controls each result; an earlier
success cannot override a newer failed, cancelled, skipped or incomplete run.

| Check                            | Required on main                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Typecheck, lint, and build       | Yes                                                                                                                |
| Unit tests                       | Yes                                                                                                                |
| Browser smoke tests              | Yes                                                                                                                |
| Android build and lint           | Yes                                                                                                                |
| Migration verification           | Yes                                                                                                                |
| Dependency audit                 | Yes                                                                                                                |
| Secret scanning                  | Yes                                                                                                                |
| CodeQL JavaScript and TypeScript | Yes                                                                                                                |
| CodeQL summary                   | If present for this SHA, it must also succeed from GitHub Advanced Security (ID 57789, `github-advanced-security`) |

A summary cannot substitute for the actual analysis job. No CodeQL workflow,
query suite, branch protection, approval requirement or security scan is disabled.
Release/validation jobs are not CI evidence and do not replace these checks.

The runner retrieves all pages of latest check runs, avoiding an accumulating
history of past attempts. If multiple results are supplied for a name, the newest
check ID controls the result. Pagination has a ten-page ceiling and rejects malformed
or oversized pages with fixed errors; it does not rely on newer GitHub CLI flags. On rejection, sanitized output
now identifies `stage: checks` and every known failing check with a fixed reason:
`missing`, `untrusted_source`, `incomplete`, or `not_successful`. No arbitrary
provider output, credentials or check payloads are logged.

## Validation and retry

The observed main response is retained as a minimal fixture containing only check
names, IDs, SHA, status/conclusion and app identity. Regression tests cover main
without a summary, a missing analysis, failed/incomplete/skipped summaries,
foreign-SHA evidence, retry ordering and spoofed app identities. Existing recovery,
artifact verification and failed-publication tests remain in place.

After human merge review of this correction, wait for successful CI on the new
main SHA and start **Release reviewed engineering fixes** with that exact SHA and
`RELEASE_REVIEWED_ENGINEERING_FIX`. Approve its protected production job through
normal review. Rerunning the original failed run would execute its old code and
cannot pick up this fix. Review subsequent schema/preflight errors independently;
this correction proves CI selection, not deployment or 10,000-bus capacity.
