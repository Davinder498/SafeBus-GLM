# SafeBus scheduled monitor continuity — 2026-11-06

**Status:** Engineering detection improvement proposed; operating readiness NOT approved.
**Reviewed source:** `4b9d15e3e1384443ab715d1626c1360e1a633119`. This is public GitHub workflow metadata and source review only.

## Finding

The GitHub Actions `Production health monitor` requests four runs per hour at
minutes 7, 22, 37, 52 (UTC). GitHub may delay or drop scheduled workflows.
The latest observed scheduled triggers at 2026-11-06 17:42:28 UTC and 10:43:11 UTC
were nearly seven hours apart; earlier triggers also showed multi-hour gaps.
The passing checks confirm public endpoints at those moments, **not** 15-minute
coverage or seven days of uninterrupted observation.

Existing `checkMonitorCadence` accepted a fresh successful scheduled run
regardless of gaps immediately before it. A recovered check could therefore
turn the Netlify watchdog green even when multiple expected checks were missed.

## Change

- Check the latest 10 scheduled `main` runs (read-only, no authentication).
- Continue requiring a fresh, completed and successful latest run.
- Require at least two recent scheduled runs; a single success is not cadence proof.
- Reject any adjacent sampled triggers more than the existing **45-minute**
  grace apart with fixed `MONITOR_CADENCE_GAP`.
- Reject sampled unsuccessful/incomplete earlier runs with fixed
  `MONITOR_CADENCE_HISTORY_NOT_SUCCESSFUL`.
- In Netlify, require explicit `{result:'healthy'}` for both the independent
  public checker and GitHub cadence checker. A fulfilled but unexpected result
  is not success.
- Require an explicit accepted provider response before writing
  `production_health_alert: provider_accepted`. Continue to fail closed and
  use fixed sanitized codes, the existing six-hour idempotency window and
  the existing `info@safebus.kids` recipient.
- Preserve environment isolation: the monitor runs only for the published
  production Netlify deploy. No secrets, customer records, extra vendors,
  database migrations, notification preferences or destructive controls change.

**These checks detect a scheduling gap; they cannot make GitHub schedule
reliable.** A gap warning is monitoring degradation, not proof of a public
website outage. The Netlify scheduled function remains the separate public
probe; it is not itself a guaranteed dead-man service.

## Required operational acceptance

1. Confirm the published Netlify `production-health-scheduled` function's
   schedule and log each actual automatic invocation (11/26/41/56 UTC), not
   manual previews. Retain UTC evidence outside public Git.
2. Confirm GitHub's separate scheduled-run timestamps and review every
   detected `MONITOR_CADENCE_STALE`, `MONITOR_CADENCE_GAP`,
   `MONITOR_CADENCE_HISTORY_NOT_SUCCESSFUL` or alert-provider failure.
3. Verify alert **inbox receipt** and a human response drill, not merely
   provider acceptance. Record the actual owner, coverage limitations,
   holiday route and independent backup (if one is appointed).
4. If GitHub missed schedules persist, procure/approve an external uptime
   checker and dead-man monitor with fixed public-only URLs, sanitized alerts
   and reviewed vendor/residency terms. Do not invent a vendor or plan purchase.
5. Retain the full required seven observed days without unexplained monitoring
   gaps or unresolved P1/P2 incidents. Sampling 10 GitHub runs does not meet
   this seven-day acceptance condition.

Source documentation:
- https://docs.github.com/en/actions/how-tos/troubleshoot-workflows
- https://docs.netlify.com/build/functions/scheduled-functions/

Deferred by the owner: physical Android tests and Supabase
compromised-password protection. No privacy, operations, map or pilot
approval is created by this change.
