# Point 9 — Operational Readiness

**Status: Repository evidence gate implemented; operating and human evidence pending.**

Commercial Readiness Point 9 requires production monitoring, actionable
alerting, incident response, customer support, backup, and recovery evidence.
This document records what the repository can enforce now and keeps every
operator, vendor, and exercise-dependent gate explicit.

## Automated public health monitor

`.github/workflows/production-health.yml` runs every 15 minutes and can also be
started manually. `scripts/check-production-health.mjs` verifies:

- the production landing page returns the SafeBus application shell;
- the direct `/login` route returns the SPA shell;
- CSP, HSTS, frame denial, MIME-sniffing protection, Referrer Policy, and
  Permissions Policy remain present; and
- the server-managed map configuration returns the approved Geoapify and
  OpenStreetMap attribution contract.

Requests use HTTPS, reject redirects, have an eight-second timeout, retry twice,
and identify themselves with a fixed health-monitor user agent. Results contain
only check names, attempt counts, status, and duration. Failure output contains
only the check name and HTTP status or a fixed contract error. Response bodies,
map URLs, API keys, account identifiers, and personal information are not
logged.

The monitor does not query Supabase, sign in, use application credentials,
write data, test notification delivery, or exercise driver/guardian workflows.
It therefore does not establish an SLA or prove database, Auth, Realtime,
provider-tile, email-delivery, or end-to-end availability.

## Alert and incident contract

A failed scheduled run is a durable GitHub Actions failure. Before Point 9 can
close, workflow-failure notifications must be routed to a named on-call owner
and backup through an approved, privacy-reviewed channel. GitHub scheduling is
best-effort and is not a substitute for an external uptime service under a
commercial availability commitment.

| Severity | Example                                                                                   | Initial action                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Application or authentication unavailable; suspected tenant/privacy boundary failure      | Freeze releases, name an incident lead, preserve evidence, assess privacy impact, and begin approved rollback/containment       |
| P2       | Maps, notifications, or live bus visibility materially degraded while core access remains | Declare degraded service, protect authoritative list/status fallbacks, investigate the affected provider, and communicate scope |
| P3       | Non-critical feature or isolated support issue                                            | Record, triage during supported hours, and escalate if scope grows                                                              |

Every P1/P2 record must include detection time, incident lead, affected service,
privacy assessment, containment, customer communication decision, recovery
time, evidence links, and a post-incident action owner. Do not copy personal
data, response bodies, credentials, raw location data, or provider secrets into
issues, chat, or monitoring systems.

Application rollback follows
[`phase-4/rollback-runbook.md`](./phase-4/rollback-runbook.md). Suspected privacy
incidents also follow [`phase-3/breach-response.md`](./phase-3/breach-response.md).
Database recovery remains a separately approved production-recovery action and
must never use the sole production project as a destructive test target.

## Fail-closed approval record

`operations-readiness.json` is the production-release authorization record for
Point 9. It is deliberately `not_approved`. `pnpm operations:verify` rejects a
release until the record contains current, non-secret references for on-call
coverage, thresholds, alert routing, privacy-safe error monitoring, both map
quota alerts, support, recovery exercises, seven operating days, and all named
approvals.

The approval is bound to the release-controlled monitoring, application
service/function, runbook, workflow, package, and test sources through a SHA-256
digest. Any change to those sources invalidates an earlier approval. Generate
the candidate digest with `pnpm operations:digest` only after all changes are
reviewed. The verifier runs after Points 6 and 8 and before pilot authorization,
database work, or deployment in the protected production release workflow.

The record stores references, decisions, dates, and measured recovery values;
it must not contain names, contact details, credentials, personal data, raw
locations, response bodies, provider secrets, or support-ticket contents.

## Completed application rollback exercise

Evidence reference `OPS/EXERCISE/ROLLBACK-001` records the protected production
application rollback exercised on 2026-08-24. The exercise used only synthetic,
public health checks and made no database, migration, fixture, RLS-test, or
Supabase configuration change.

- The exercise began at `2026-08-24T22:58:48Z`. The first approved run
  ([run 32787213148](https://github.com/Davinder498/SafeBus-GLM/actions/runs/32787213148))
  stopped before deployment because Netlify required an explicit application
  selection for the monorepo. The queued duplicate was cancelled without a
  deployment.
- [PR 162](https://github.com/Davinder498/SafeBus-GLM/pull/162) added the
  explicit `@safebus/web` selection to rollback and normal release deployments
  and added regression coverage.
- The corrected protected rollback
  ([run 32789963139](https://github.com/Davinder498/SafeBus-GLM/actions/runs/32789963139))
  published deploy `6a8cd58ab19660a6561e3d63` from immutable commit
  `9c0432ce75159918ccd01089301ee517ca00aaee`. The deploy was ready at
  `2026-08-24T23:37:34.593Z`.
- The privacy-safe production monitor reported the landing page, direct login
  route, and server-managed map configuration healthy on their first attempts
  at `2026-08-24T23:38:17.856Z`.
- Measured recovery from the original exercise dispatch to verified rollback
  health was 39 minutes 30 seconds, conservatively recorded as 40 minutes.
- The protected restoration
  ([run 32790241039](https://github.com/Davinder498/SafeBus-GLM/actions/runs/32790241039))
  published deploy `6a8cd658cb6d4374d0e8d13e` from current main commit
  `4fa33ebfdb6176d71682e9d80d2e72a5f495d27a`. It was ready at
  `2026-08-24T23:40:51.982Z`, and all three public health checks again passed on
  their first attempts at `2026-08-24T23:41:30.909Z`.

Both successful deployments required an independent production-environment
approval. GitHub retains the reviewer history on each workflow run. The known
good and restored commits contain no Supabase migration difference. This
exercise approves only the application-rollback evidence; backup restore,
alert delivery, error monitoring, quota alerting, seven-day observation, and
final Point 9 approvals remain open.

## Point 9 exit gates

- [ ] Name the primary on-call owner, backup, supported hours, and escalation
      contacts.
- [ ] Route monitor failures to the approved paging/notification channel and
      complete a failure-notification drill.
- [ ] Approve uptime, latency, GPS freshness, notification-queue, provider
      quota, and error-rate thresholds without overstating the Free-tier service.
- [ ] Add privacy-reviewed server/application error monitoring and verify its
      redaction rules with synthetic data.
- [ ] Configure Geoapify 70% and 90% quota alerts and record evidence for Point 8.
- [ ] Complete recovery exercises. The protected application rollback passed
      with a measured 40-minute recovery; backup restore and the remaining
      evidence are still open.
- [ ] Approve the customer support intake, severity, communication, and ticket
      retention process.
- [ ] Observe at least seven consecutive operating days and resolve unexplained
      health-monitor gaps.
- [ ] Obtain Operations, Security, Privacy, and Platform Administrator approval.

## Evidence record

| Evidence                      | Reference                                    | Owner                           | Date | Result |
| ----------------------------- | -------------------------------------------- | ------------------------------- | ---- | ------ |
| Scheduled health history      | _pending post-merge observation_             | Operations Lead                 |      |        |
| Machine approval record       | `operations-readiness.json` (`not_approved`) | Operations / Platform           |      | Open   |
| Failure-notification drill    | _pending_                                    | Operations Lead                 |      |        |
| Error-monitor redaction test  | _pending vendor approval_                    | Security / Privacy              |      |        |
| Geoapify quota alerts         | _pending_                                    | Operations Lead                 |      |        |
| Application rollback exercise | `OPS/EXERCISE/ROLLBACK-001`                  | Engineering / Operations        | 2026-08-24 | Pass   |
| Backup restore exercise       | _pending paid tier or approved equivalent_   | Operations Lead                 |      |        |
| Incident tabletop             | _pending_                                    | Security / Privacy / Operations |      |        |
| Final Point 9 approval        | _pending_                                    | Platform Administrator          |      |        |
