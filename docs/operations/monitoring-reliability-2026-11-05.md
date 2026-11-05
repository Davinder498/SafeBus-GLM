# Authorization audit, monitoring and workspace corrections

## Acceptance and role boundaries

School authority admins, transportation admins and platform admins retain their
existing overview access, writes, RLS, session and MFA requirements. Guardians and
drivers receive no new admin access; retired school-admin access stays denied.
Notification events/channels, recipient choices and business mutations are unchanged.
The monitoring code reads public health endpoints and public GitHub run metadata
only. It never queries customer rows, sends messages or receives a privileged key.

## Authorization acceptance

Reviewed main f8f6bc9 contains the OpenAPI-discovery correction from PR #379.
A fresh full Authorization audit is required, using the existing protected
`authorization-audit.yml` workflow on main. Do not replay the earlier failed run:
it uses the older contract. Preserve its production environment review, per-role
catalog comparisons, all explicit service-role denials, reserved-default boundary
checks and extension API isolation checks. No SQL repair or permission expansion
is included in this change.

During this task the connected browser was unavailable; the alternate browser
reached GitHub signed out. Its public page confirms the most recent audit remains
41962958840 (failed before PR #379). The GitHub connector cannot dispatch a new
workflow. A current passing live audit is not claimed; sign-in/dispatch is the
remaining access dependency, not an authorization test result.

## Monitoring before and after

Before: one GitHub cron at minutes 0/15/30/45 checked the public site. The workflow
is active but recent returned schedule runs were hours apart. GitHub explicitly
allows delayed/dropped schedules under load. The cause of these particular gaps
has not been proven; a cron adjustment alone cannot establish reliable cadence.

After source implementation:

- Move GitHub checks to 7/22/37/52 to reduce peak-minute contention. Preserve the
  existing independent public health checks and failure status; add a non-secret
  failure annotation and run-summary link to these operating instructions.
- Add a Netlify scheduled function at 11/26/41/56. It runs only on the published
  production deploy, using the runtime `context.deploy` metadata rather than
  build-only environment variables. Manually invoked previews and old deploys skip; missing runtime metadata fails.
- It checks the public landing/security headers, login shell and map configuration
  with no retries and eight-second network deadlines, plus the most recent GitHub
  scheduled main-branch health run. Calls use fixed destinations; redirects fail.
- GitHub run metadata needs no token. Missing/malformed responses, rate limits,
  outages, future timestamps, failed/incomplete runs and a trigger older than
  45 minutes fail. A newer failure cannot be hidden by an older success. Manual
  runs do not count as proof of scheduled cadence. The 45-minute grace is an
  engineering detection threshold, not a promised customer SLA.
- Both independent observations run even when one fails. Log only fixed check
  identifiers, sanitized fixed codes and observation time; no arbitrary exception,
  response body, map URL/key, credential, student or location is logged.
- The function throws on failure so Netlify records an invocation failure; it
  does not silently return a successful HTTP response for a failed observation.
  The health check has a 24-second network deadline budget; the five-second GitHub
  request runs in parallel, below Netlify's
  30-second scheduled limit. There is no provider retry fan-out in this function.

This adds another scheduler and detects missing GitHub runs. It is not a guaranteed
external dead-man service: a complete Netlify outage still relies on the GitHub
check and its notifications, and no schedule is claimed to be an SLA.

## Operating evidence still needed after deployment

Verify the published function's Scheduled badge, next-run time and invocation
logs; record real consecutive invocations from both schedulers. Run now on a
preview can test code but does not prove production cadence. The current stale
GitHub history may correctly make initial watchdog invocations fail until fresh
scheduled runs succeed. Inspect the per-check result rather than interpreting
cadence failure as proof that the application is down.

Check GitHub Actions failure-notification delivery and choose/verify the Netlify
failure-notification route with the actual responsible owner. This change sends
no test alert or real recipient message and does not invent a support recipient.
Alert delivery and response ownership remain unverified until recorded. Do not
mark the operations-readiness record approved from local tests or a merged PR.
If both-provider observation still has gaps, an independently operated heartbeat
monitor may be needed; no new service or spending is provisioned here.

## UI corrections

The route summary now labels the value **Services with a current driver**, matching
its actual date-effective covered-service count. A single driver covering two
services is not described as two people. No assignment selection changes.

The student overview retains section shortcuts, status/counts and incomplete-stop
warnings while removing repetitive read-only/review instructions. Guardian linking,
effective dates and edit controls remain in their existing sections. School labels
use **School (optional)** instead of exposing internal metadata wording. Essential
map-review, archive/delete, billing and unsaved-change warnings remain.

## Primary platform references

- https://docs.github.com/en/actions/how-tos/troubleshoot-workflows
- https://docs.netlify.com/build/functions/scheduled-functions/
- https://docs.netlify.com/build/functions/api/#deploy
- https://docs.netlify.com/build/functions/environment-variables/

## Local validation

Type checking, lint, web/root build, mobile build and Capacitor Android sync
completed successfully. The full suite passed 1,484 tests (1,027 web, 24 mobile,
433 release). Netlify's local functions build packaged the new function and both
shared monitoring libraries successfully. Generated mobile icon changes were
restored and are excluded from this change.

The existing student-workspace browser test assertions were updated. A local
browser run could not start because the official Chromium download was truncated;
CI browser results and deployed visual verification remain required. Local checks
do not establish production cadence, notification delivery or a passing hosted
authorization audit.
