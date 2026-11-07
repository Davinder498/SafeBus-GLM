# SafeBus seven-day monitoring evidence audit

**Status:** Read-only audit prepared; Commercial Release 1 operational readiness is **NOT APPROVED**.

## Scope and purpose

GitHub's SafeBus public-health workflow requests UTC checks at minutes 7, 22,
37 and 52. Observed scheduled runs have occasionally been hours apart.
A recent success is not seven days of continuous monitoring; a manual dispatch
does not count as a scheduled trigger.

Run `pnpm operations:audit:github-cadence` from the project root to review
the preceding seven UTC days of **public GitHub schedule metadata only**.

The audit makes at most ten bounded pages of read-only requests (100 records per
page, HTTPS, eight-second timeout), with no GitHub token, provider keys, customer
data, GPS, support tickets, body logging, or account access. It checks the
whole seven-day window and adjacent trigger gaps, requires completed/successful
runs, and uses the existing 45-minute engineering grace threshold.

## Result boundaries

- Exit 0: the sampled GitHub-only schedule history meets the defined check
- Exit 2: confirmed missing runs, gaps or unsuccessful scheduled executions
- Exit 1: unverified or malformed API history, including incomplete pagination

The emitted JSON contains only counts, UTC boundaries and fixed status codes.
It always reports `scope=github-scheduled-main-only`,
`netlifyScheduleEvidence=not_checked`,
`alertInboxEvidence=not_checked` and
`operationsReadiness=not_approved`.

Passing **does not establish a 15-minute availability SLA, Netlify scheduled
coverage or real inbox alert delivery**. GitHub schedules may be delayed or
dropped. The tool neither modifies the Point 9 machine-readiness record nor
authorizes a release.

## Independent acceptance requirements

To complete seven-day operational evidence, a human reviewer must also
inspect seven days of actual **automatic** Netlify production function
invocations, sanitized per-check results, delivery outcomes and real response
coverage; establish the named on-call owner and backup; review the failed
schedule intervals; and obtain accountable operations/security/privacy
approval. A provider's accepted email is not proof the inbox received it.

Record only dated non-secret evidence references in the restricted operational
record. No synthetic production accounts, student records, live GPS, destructive
retention, Netlify environment changes or provider purchases are part of this
task. Physical Android testing and leaked-password protection remain deferred.

This complements merged PRs #395 and #398 and the separately reviewed PR #399
observation-only monitoring stage.
