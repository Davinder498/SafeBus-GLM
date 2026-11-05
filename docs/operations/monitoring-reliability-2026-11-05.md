# Authorization audit, monitoring and workspace corrections

## Acceptance and role boundaries

School authority admins, transportation admins and platform admins retain their
existing overview access, writes, RLS, session and MFA requirements. Guardians and
drivers receive no new admin access; retired school-admin access stays denied.
Notification events/channels, recipient choices and business mutations are unchanged.
The monitoring code reads public health endpoints and public GitHub run metadata
only. The owner subsequently selected info@safebus.kids for operational alerts.
The follow-up implementation uses the existing server-side email provider key
only to send fixed operational messages; it never queries customer rows or
receives a database/service-role key.

## Authorization acceptance

Reviewed main f8f6bc9 contains the OpenAPI-discovery correction from PR #379.
The fresh full Authorization audit used the existing protected
`authorization-audit.yml` workflow on main. Do not replay the earlier failed run:
it uses the older contract. Preserve its production environment review, per-role
catalog comparisons, all explicit service-role denials, reserved-default boundary
checks and extension API isolation checks. No SQL repair or permission expansion
is included in this change.

The connected browser was initially unavailable and the alternate browser was
signed out. Secure sign-in subsequently succeeded and a fresh run was dispatched
on current main f8f6bc9: https://github.com/Davinder498/SafeBus-GLM/actions/runs/42000056207.
The protected review was approved and the full catalog and Data API authorization
job completed successfully. PR #380 merged as 18e2f6d and was published by Netlify.
Its CI/browser/Android/security checks passed. Preserve the production review gate.

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
  with no retries and six-second network deadlines, plus the most recent GitHub
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
  The health check has an 18-second network deadline budget; the five-second GitHub
  request runs in parallel. Operational email requests add at most five seconds
  in parallel, for a 23-second network deadline budget below the scheduled limit.
  There are no application-level retries; the platform may retry failed invocations.

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

Netlify inspection confirmed the published Scheduled badge, expected schedule and
an automatic 09:26 UTC invocation on November 5. A bounded manual run at 09:33 UTC
also passed public health and correctly failed with MONITOR_CADENCE_STALE. This is
evidence that the runtime guard and stale-monitor detection work; it is not proof
of consecutive timely scheduler runs. Netlify's inspected notification options
covered deployment events, not established runtime-failure delivery.

## Operational email follow-up

The owner selected **info@safebus.kids**. The follow-up code sends fixed operational
emails through the existing Resend configuration only after a published-production
observation fails. Public-health and GitHub-cadence failures have separate subjects
and keys, so a scheduler failure cannot suppress the public-health alert. The
messages distinguish an unverifiable monitor from an application outage and link
to the current logs. No customer rows, locations, provider bodies, keys or arbitrary
exception strings enter the message or logs. No guardian/driver preferences or
recipient lists are changed. Previews skip the entire check and send no email.

Netlify masked metadata confirms SAFEBUS_EMAIL_PROVIDER_API_KEY includes Functions
scope and a visible Production context; SAFEBUS_EMAIL_FROM has all scopes and a
visible Production context. Values were not revealed. Reuse these settings. Do not reveal, copy or place these values in source/frontend code.
The recipient and destination URLs are fixed in source; no request can choose an
address. Missing configuration, timeout, provider rejection (including 409/429),
malformed success or a response without a message ID records a fixed delivery
failure. Neither successful nor failed email sending turns the observation green.

Each check shares one stable payload and Resend idempotency key within a six-hour
UTC window (00/06/12/18 UTC). Resend retains keys for 24 hours, so repeated checks,
platform retries and cold starts in that window do not send a fresh email. A new
window permits a reminder. This is per check/window rather than per incident:
a second failure after recovery within the same window is also suppressed, and
failures straddling a boundary can produce two close emails. No automatic recovery
email or persistent incident-state store is introduced. A concurrent idempotency
request may fail this invocation; the next scheduled invocation retries the same
stable request. A provider outage can prevent alert delivery; a full Netlify outage
still depends on the independent GitHub monitor and its notification settings.

After this follow-up merges and deploys, inspect a real failing observation's
production_health_alert record and provider delivery result for the fixed inbox.
Provider acceptance is not proof of inbox receipt. Confirm delivery and responsible
response ownership, then record consecutive automatic runs from both schedulers.
Do not approve operational readiness from local tests, a merge, or a manual run.
No new service or spending is provisioned. Rollback this follow-up by reverting its
commit through a reviewed PR; the original non-email monitor remains available.

Primary email reference: https://resend.com/docs/dashboard/emails/idempotency-keys

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

The follow-up adds four alert regression tests to the normal pnpm test/CI command
and includes both shared monitor helpers and alert tests in the operational
evidence digest. No readiness approval record is changed.

Follow-up validation: 1,488 tests passed (1,027 web, 24 mobile, 437 release),
including 18 focused monitoring/readiness tests. Type checking, lint, root/web
build, mobile build and Android sync passed. The local Netlify functions build
succeeded, and the packaged function ZIP contains the alert helper and fixed
recipient. No operational email was sent by these mocked local tests. Merge,
production invocation and real provider/inbox evidence remain pending.
