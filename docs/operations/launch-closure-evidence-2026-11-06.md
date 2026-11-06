# SafeBus launch closure evidence — November 6, 2026

**Status: incremental verification; commercial launch NOT APPROVED.** Source baseline: `ab68695a630caf065f96e6f11c69d56f8a251b1e`.
This review is a non-destructive operating record. It does not create a legal
sign-off, supplier agreement, customer authorization, synthetic production user,
store approval or field-test result.

## Independently supported evidence

| Control | Evidence | What is / is not proven |
| --- | --- | --- |
| Production authorization | [GitHub audit #42214583591](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42214583591) passed at reviewed `main` | 225 public RPCs, 170 authenticated, 55 service-only; OpenAPI and private schema isolation. Does not establish real-role, cross-authority user journeys. |
| Android build | [Signed release #42241011897](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42241011897) | Signed AAB and provenance for 1.0.7 / version code 8. Does not prove field reliability or app store approval. |
| Google Play | Owner-linked read-only Play Console observation, November 6 | Version 8 available to **internal testers**, not reviewed for public distribution. Closed testing/production remain separate. |
| Archive key custody | Owner reported local PowerShell AES-GCM recovery **PASS** after production generated a synthetic `retention_archive_recovery_sample` | Synthetic sample recovery only; not preservation read-back of a school-authority case or proof of the custody of every old archive key version. No keys or ciphertext are retained here. |
| Retention | Read-only BusSafe control showed `destructive_enabled=false`; existing daily dry runs passed | Automatic deletion is NOT authorized. A dry-run with `gps:500` and `saturated:true` means a capped estimate, not deleted rows or proof of available throughput. |
| Production health | [Scheduled monitor #42264086629](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42264086629) succeeded November 6 | One passing observation, not seven continuous days or evidence of every planned 15-minute scheduled run. The Netlify fallback and missing-run detector are separate. |

## Immediate engineering follow-up in this PR

- Keep production monitoring fail-closed when scheduled GitHub runs are missing;
  no manual run or monitor-threshold adjustment is presented as success.
- Add a fixed operations email for **persistent bounded-retention saturation
  only during approved destructive execution**. The current dry-run mode sends
  no backlog message. Provider failure does not re-run completed destructive
  batches. The existing per-check six-hour Resend idempotency controls apply.
- Correct the active support runbook to use Alberta's `America/Edmonton`
  time zone, while retaining UTC source/event timestamps and historical
  review-provenance timestamps unchanged.

## Remaining readiness / accountable decisions

1. **Privacy and lawful processing:** actual school-authority processing basis,
   PIA applicability, contracting entity and applicable statutory duties;
   customer MSA/DPA/SLA/security and data return/retention terms; actual
   supplier terms and subprocessor/cross-border handling. Approval fields remain
   `not_approved`; do not fabricate reviewers or acceptance dates.
2. **Operations:** seven days of accepted monitoring, owner and backup coverage,
   support hours and holiday response, real delivered-alert drill, privacy
   incident tabletop, alert/redaction observation, customer escalation method.
   Existing email acceptance is not proof of staffed alert response.
3. **Maps:** Geoapify plan/licence/SLA, restricted production key and quota
   thresholds at 70/90%, cross-border review, web outage/recovery and supported
   Android acceptance, seven observed days.
4. **Billing/real account journeys:** end-to-end invitations/activation/MFA,
   district control-plane and scoped operations, guardian visibility and
   notification, billing/webhook/cancellation, with lawful synthetic test
   identities in an explicitly approved isolated environment. Automated
   fixtures alone do not establish live acceptance.
5. **Deferred by owner:** physical Android field acceptance and Supabase
   leaked-password protection. Neither is marked passed. The Google Play
   production-eligibility / closed-test requirements also remain open.
6. **Retention rollout:** keep Netlify `SAFEBUS_RETENTION_LIFECYCLE_EXECUTE`
   and database destructive control off until legal schedule/holds, archival
   read-back, access boundaries, customer requirements and observed throughput
   are approved. Supplier/mailbox/backups have separate disposal implications.

## Scope of checks

No customer/child records, raw GPS, credentials or archive keys are reproduced
in this document. A source review and CI checks may verify code/test contracts,
not physical devices, legal consents or live provider-account acceptance. Final
readiness records `docs/governance/privacy-readiness.json`,
`map-readiness.json`, `operations-readiness.json` and
`android-readiness.json` remain `not_approved` until valid evidence exists.
