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

## Incident and recovery exercises

- [ ] Walk through one P1 application outage and one suspected privacy incident
      using synthetic facts.
- [x] Execute the protected application rollback workflow against an approved
      release and record time to recovery (`OPS/EXERCISE/ROLLBACK-001`: 40
      minutes from initial dispatch to verified rollback health; current release
      restored and verified).
- [ ] Complete the separately authorized backup/restore exercise in an isolated
      Canadian recovery target; never restore over the sole production database.
- [ ] Verify customer communication ownership, support intake, escalation, and
      post-incident actions.
- [ ] Record Operations, Security, Privacy, and Platform Administrator approval.

## Authorize the exact reviewed release

- [ ] Complete every field in `docs/governance/operations-readiness.json` with
      approved, non-secret evidence references and measured recovery values.
- [ ] Confirm the backup restore used a separately approved isolated Canadian
      recovery target and did not write to or restore over the sole production
      Supabase project.
- [ ] Run `pnpm operations:digest` on the exact reviewed commit and record that
      digest as `approvedEvidenceDigest`.
- [ ] Set an approval validity window no longer than 90 days, then run
      `pnpm operations:verify` and retain its privacy-safe output.
- [ ] Use the protected production release workflow; do not bypass the Point 9
      gate, pilot authorization, database preflight, or human environment review.
