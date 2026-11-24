# Risk-based client CI coverage policy

PRs automatically select browser and Android coverage using the complete merge-base
diff, including deleted paths and both sides of renames. Missing, malformed,
unknown or mixed change evidence defaults to full coverage. No PR label or
manual flag can disable checks.

Only narrowly reviewed non-client paths may omit both full browser and native
Android suites: README/CHANGELOG and docs Markdown, top-level release unit tests,
observed catalog JSON, the authorization surface inventory, the private retention
audit helper, and the four explicitly listed isolated, unshipped GPS candidate
files in services/tracking-ingestion. New service files, deployment configuration,
runtime imports, migrations, shared packages, client code and workflow changes
remain full coverage. Remove the isolated candidate exceptions before mounting
the code in production or importing it into a shipped client.

A package.json change qualifies only when a merge-base/head semantic comparison
proves that every field except scripts.test is unchanged and that the existing
test command and all original test arguments are preserved, with only literal
paths to newly registered release tests present in the same diff added. Any other
package or lockfile change requires full coverage.

Every PR and main commit still runs typecheck, lint, production build, the full
unit/security regression suite, migration verification, dependency audit, secret
scanning and the separate static security analysis. The stable Browser smoke tests
and Android build and lint job names remain required; an eligible PR skips their
expensive steps but both jobs verify the successful scope decision. A failed or
missing selector fails both gates. Full suite failures remain failures.

Main commits always run full browser and native Android coverage. Protected
release publishing continues to require successful full checks for the exact
reviewed main SHA. PR-only omissions cannot substitute for release evidence.
No branch protection, release gate, app runtime, database or production data is
changed by this CI policy. Reassess scope when new runtime dependencies are added.
