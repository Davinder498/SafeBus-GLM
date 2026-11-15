# External monitoring handover — November 15, 2026

## Purpose and evidence

GitHub scheduled health runs were hours apart despite a 15-minute cron. The
cadence warning described missing monitoring runs, not necessarily an app outage.
The exact cause of GitHub's trigger gaps was not established.

The owner activated UptimeRobot Free for https://safebus.kids. A dashboard screenshot
confirmed Up and a five-minute interval; the owner confirmed Test Notification
email receipt at info@safebus.kids. This proves configuration and that test's
receipt, not seven-day history, authenticated journeys or every alert category.

## Replacement

- UptimeRobot checks the public website independently every five minutes.
- GitHub production-health.yml retains workflow_dispatch diagnostics; its cron
  is removed. Code CI, security checks and protected releases are unchanged.
- Netlify production-health-scheduled retains the landing page/security headers,
  login shell, map configuration and all six existing application probes. It
  no longer fetches GitHub schedule metadata or emits github_cadence alerts.
- A completed published-production invocation writes just a timestamp and
  healthy boolean in one site-wide Netlify Blobs record. Healthy requires all
  checks passing and application mode alert. Observe/off cannot certify health.
  A failed probe writes false before sending its existing operational alert.
- GET/HEAD /.netlify/functions/monitoring-status reads that single record and
  returns 200 available or 503 unavailable. Missing, malformed, future, failed,
  stale (>45 minutes), unavailable storage and non-published contexts fail closed.
  It neither runs probes nor writes records nor sends emails. Responses prohibit
  caching and reveal no customer, GPS, account, credential or provider details.
- Storage calls have a three-second overall deadline, with two-second per-request
  network timeouts. Heartbeat write failures generate a fixed operations alert.
  The last completed observation survives deployments and still expires after
  45 minutes. Normal releases do not manufacture an outage while awaiting their
  next scheduled run. Only currently published production runners may refresh it.
- A second UptimeRobot HTTPS monitor must check that status URL every five minutes.
  A website-only monitor does not detect a stopped application scheduler. The
  45-minute grace is an internal threshold, not a customer SLA.

Historical GitHub cadence scripts and seven-day evidence remain available for
historical investigations only. They are no longer the replacement's acceptance
criteria. Email template version advances to v2 to avoid reusing a Resend
idempotency key with a changed message body during rollout.

## Acceptance and role boundaries

School authority, school-scoped, transportation and platform administrators,
guardians and drivers retain existing role, tenant, session/MFA, consent and
channel boundaries. No product screen, customer event, billing rule or database
schema changes. Retired school-admin access remains denied. Only the operations
owner receives fixed alert messages; no customer notifications are used as QA.
Automated checks do not extend support beyond Monday–Saturday 06:00–18:00
America/Edmonton, including critical incidents.

## Rollout and remaining verification

1. Validate and merge the single reviewed PR, then use the protected engineering
   artifact release with the exact current main SHA. Retain the human production
   reviewer. Do not enable Netlify cloud builds or purchase a plan.
2. Confirm the Netlify schedule still reads 11,26,41,56 and application mode alert.
   Inspect the first real published invocation: public and application checks must
   pass, with no github_cadence category. Verify the public status URL returns 200
   after that invocation. On first installation it returns 503 until the first
   successful observation; later releases retain the recent completion signal.
3. In the owner's existing UptimeRobot account, add an HTTP(S) monitor named
   SafeBus application monitoring for
   https://safebus.kids/.netlify/functions/monitoring-status, interval five minutes,
   using the existing info@safebus.kids alert contact. Keep the website monitor.
   Test its notification and record actual receipt. Do not claim configured until
   the account confirms it; no new vendor or paid plan is required.
4. Verify successive real scheduled completions and monitor observations. Local
   fixtures cover stale/missing/future records, failures, modes, preview isolation,
   read-only public requests and recovery to fresh health. A controlled live
   stale/recovery drill remains distinct; do not stop live monitoring merely to
   manufacture evidence without a bounded agreed drill.

Current source checkpoint: prepared, not deployed. The second monitor and live
status checks remain pending. The already active website monitor remains useful
throughout. External status monitoring only proves bounded aggregate probe health;
it does not qualify device delivery, field GPS, capacity or commercial launch.

## Recovery

Use the protected release workflow to restore the last known-good artifact if
this change breaks scheduled monitoring. It restores the previous GitHub-cadence
warning until the replacement is repaired. Keep UptimeRobot website monitoring
active. Do not change expected hashes, suppress real probe failures or remove
release protections. Investigate 503 through Netlify logs; do not label it proof
that every customer is offline.
