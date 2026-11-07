# Point 9 Operations Acceptance

**Status: Partially executed; remaining operating and human evidence pending.**
Repository enforcement and the protected application rollback are complete,
but this checklist does not approve Point 9.

Use synthetic, non-personal evidence only. Do not use real student, guardian,
or driver data, production credentials, raw locations, provider keys, or
response bodies in screenshots, workflow logs, tickets, or incident records.

## Automated monitor

- [ ] Run `Production health monitor` manually from the default branch.
- [ ] Confirm all three checks pass and the log contains only the origin,
      timestamps, check names, attempts, durations, and pass/fail status.
- [ ] Confirm the scheduled workflow runs at least every 15 minutes when GitHub
      scheduling is available; record any delayed or missing run without calling it
      an application outage.
- [ ] Confirm no workflow or log contains a Supabase credential, map key,
      personal record, response body, or map tile URL.

## Application signal acceptance — staged, not automatically approved

- [ ] Confirm the production Netlify deploy has the new source and the
      application probe flag is disabled by default.
- [ ] Verify read-only HEAD count contracts, exact Content-Range values and
      existing server-only Supabase credentials without recording their value.
- [ ] With approved synthetic test data and authorized scope, check active vs
      paused vs recently started trip GPS states and email/push queue thresholds.
      Do not create or edit production school/driver/guardian/test fixtures.
- [ ] Confirm that healthy idle operation generates no false GPS/queue alarms.
- [ ] Perform a fixed-key tile probe (one public tile) with no credential
      disclosure and verify failure handling without routing to alternate providers.
- [ ] Approve operational thresholds and a controlled production activation
      of `SAFEBUS_APPLICATION_MONITOR_ENABLED=true` only after review.
- [ ] Confirm real scheduled logs contain only safe check names/statuses;
      verify email reaches the operations inbox for a synthetic failure.
- [ ] Obtain separate error telemetry vendor/redaction evidence and seven
      operating days before approving commercial operations. The aggregate
      probes alone do not satisfy the complete application error monitoring gate.

## Alert drill

- [ ] Name the primary on-call owner and backup before configuring delivery.
- [ ] Route workflow failures to an approved notification channel.
- [ ] Perform a failure-notification drill against a disposable public test
      endpoint in a reviewed, unmerged drill branch. Do not deliberately impair the
      production site.
- [ ] Confirm one actionable alert arrives, contains no sensitive data, links
      to the failed workflow, and reaches both primary and backup within the
      approved response window.
- [ ] Record the drill evidence reference and remove the drill branch.

## Incident response and historical recovery evidence

- [ ] Walk through one P1 application outage and one suspected privacy incident
      using synthetic facts.
- Historical only: protected application rollback `OPS/EXERCISE/ROLLBACK-001`
  completed in 40 minutes, with the current release restored and verified.
  It is retained without a launch requirement to repeat it.
- Backup/full-restore/disaster-recovery exercises are excluded from commercial
  readiness by DL-023. Existing production-change protections remain in force.
- [ ] Verify customer communication ownership, support intake, escalation, and
      post-incident actions.
- [ ] Record Operations, Security, Privacy, and Platform Administrator approval.

## Authorize the exact reviewed release

- [ ] Complete every field in `docs/governance/operations-readiness.json` with
      approved, non-secret evidence references for the retained operating controls.
      Format 2 does not require restore evidence, recovery times or recovery points.
- [ ] Run `pnpm operations:digest` on the exact reviewed commit and record that
      digest as `approvedEvidenceDigest`.
- [ ] Set an approval validity window no longer than 90 days, then run
      `pnpm operations:verify` and retain its privacy-safe output.
- [ ] Use the protected production release workflow; do not bypass the Point 9
      gate, pilot authorization, database preflight, or human environment review.
