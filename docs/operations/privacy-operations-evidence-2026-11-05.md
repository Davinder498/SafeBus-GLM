# Supplier, retention and response completion evidence

**Date:** 2026-11-05, America/Regina
**Base:** merged PR #385, main 9fd5cc9a410677d24cc0f2ef6043e97464417398
**Status:** Engineering repairs/review completed as described; business and field acceptance not fabricated

## Concrete repairs

| Area                | Before                                                                                                                 | Prepared behavior/evidence                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduled retention | Empty/malformed RPC results could be logged as completed; a transport exception could expose arbitrary provider detail | Require exactly the twelve reviewed policies, unique known keys, completed state, matching dry-run flag, null error code and safe nonnegative counts. Require complete notification totals. Stop with HTTP 500 and a fixed safe code on any failure; do not call the next stage after an invalid policy result.                                                                     |
| Dry-run safety      | Source correction and successful database execution were obscured by stale October notes                               | Fresh read-only catalog/run history records the installed correction, twelve completed dry runs and disabled destructive control. No deletion flag, period, permission or database record changed.                                                                                                                                                                                  |
| Supplier agreements | Registers lacked the mailbox supplier and treated agreement completion too generically                                 | Record actual terms/incorporation mechanisms, current public source links, Canadian Zoho MX observation and specific account evidence still needed. A separate countersignature is not presumed for every incorporated DPA.                                                                                                                                                         |
| Approval integrity  | New response/onboarding procedures were not included in release evidence digests                                       | Privacy/operations approval digests now include these current procedures, supplier/retention review and runner verification inputs. Regression tests require source/evidence changes to invalidate a previous digest. The mailbox supplier also requires its own evidence entry, so sender approval cannot silently cover received correspondence. No missing approval is invented. |

Role acceptance: school authority admins, transportation admins, guardians and
drivers gain no retention controls or data access; the retired school-admin role
stays denied. Platform retention keeps its existing MFA/recent-sign-in controls;
server execution keeps the database approval guard. The server reporting repair
changes failure detection, not authority, recipient choices or retention periods.

## Verification performed

- Read-only BusSafe observation at 15:47:41.520698 UTC: twelve active policies,
  twelve latest completed dry runs, no error codes, destructive control false,
  no approval reference. Function/catalog inspection found no scoped legal-hold
  exclusion in the inspected retention paths. See the
  [aggregate observation](../governance/phase-3/retention-observation-2026-11-05.json).
- Actual domain MX lookup returned mx.zohocloud.ca, mx2.zohocloud.ca and
  mx3.zohocloud.ca. This confirms mail routing, not every storage/support country.
- Bounded public health observation passed landing/security headers, login shell
  and map configuration. GitHub scheduled cadence still returned
  MONITOR_CADENCE_STALE. See [operating observation](operating-observation-2026-11-05.json).
  The owner previously deferred the scheduler repair; it remains visible, not
  muted or treated as healthy. This check sent no email.
- Reproduced the runner reporting bug: 15 of the first 17 new tests failed against
  the old implementation. All 17 passed after the repair; additional failure/
  configuration cases and full checks are reported in the PR.
- Ran the existing public-health/operational-alert fault suite: 12 tests passed,
  zero failures. Fetch/provider calls are mocked; no real email, customer message,
  charge, trip or production fixture was created.

This is engineering evidence. The two database RPCs are separate calls. A reported failure does not undo
already completed database work; destructive activation must address partial-run
reconciliation and bounded retries. The live scheduled runner will acquire the code
only after merge/deployment; its next actual run must be checked separately.
A success from the old code is not retrospective evidence of strict validation.

## Engineering response walkthrough

**Participant:** Codex engineering agent reviewing the current runbook and running
owned fault tests. **Method:** hypothetical cases plus automated mocks; no human
responder performance, legal signature or real customer case is represented.

| Injected case                                                          | Action/decision walked through                                                                                                                                    | Observed result or remaining evidence                                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public site healthy, GitHub cron stale                                 | Distinguish monitor cadence from outage; check both schedules and current logs; route the fixed operations alert                                                  | Automated stale-cadence/failure tests passed; fresh read-only cadence remained stale. Inbox receipt was owner-confirmed earlier, not newly tested here.              |
| Public health failure and alert-provider rejection                     | Keep observation failed; attempt independent checks; preserve fixed safe failure codes rather than provider bodies                                                | Mock fault tests passed; provider failure cannot turn the check green. No real notification was sent.                                                                |
| Retries/preview deploy                                                 | Apply per-check six-hour UTC idempotency; keep preview sends inert                                                                                                | Mock idempotency and preview cases passed. No recovery email is promised; silence is not evidence of recovery.                                                       |
| Retention RPC missing policies, wrong dry-run mode or malformed counts | Reject completion and stop before the next RPC; record a fixed failure                                                                                            | Reproduced on old code and passed with the new validation. Database execution stays disabled.                                                                        |
| Suspected wrong-guardian disclosure                                    | Treat as P1, preserve scoped evidence, alert the authority's verified privacy contact, assess legal harm separately and contain through reviewed controls         | Desk walkthrough completed against the breach/runbook steps. Actual staffed response, customer notification and regulator assessment were not exercised or approved. |
| Lost-account access/deletion request                                   | Accept direct email without sign-in; verify identity/authority, route transport records and handle own-business records directly; track applicable legal deadline | Desk walkthrough completed. Do not relink or delete based on email alone. Real request verification/search/disposal remains unproven.                                |
| Owner unavailable during support hours                                 | Record the actual single-owner arrangement and an escalation/coverage limitation                                                                                  | Owner handles support and backup escalation personally. No independent backup employee is invented; holiday/urgent escalation mechanics remain to settle.            |

The [response runbook](support-incident-runbook.md),
[access/correction procedure](../governance/phase-3/access-and-correction.md) and
[breach procedure](../governance/phase-3/breach-response.md) govern handling.
This walkthrough is not evidence of real-account role journeys, physical Android
behavior, sustained seven-day monitoring or a completed staff response drill.

## Decisions prepared, not silently approved

1. **Retention:** use the existing configured 30/90/395/730/2-day policy values as
   the transport/security proposal, with the precise triggers in the
   [schedule](../governance/phase-3/retention-schedule.md). Proposed inquiry/support
   periods are 90 days after resolution and 365 days after closure respectively.
   Finance records follow the applicable CRA baseline/exceptions. Accept purposes,
   customer duties, holds and provider windows before activation.
2. **Destructive execution:** remain disabled until scoped hold/cascade handling,
   notification-trigger alignment, residual-identity review, safe technical
   acceptance and protected rollout are complete. Period approval alone cannot
   make these gaps pass.
3. **Suppliers:** retain account holder/applicable agreement evidence, actual
   location/expiry settings and any signed exceptions. See the
   [completed public terms review](../governance/phase-3/supplier-review-2026-11-05.md).
   Zoho's DPA request/signature route is identified; no request or signature was
   submitted on the owner's behalf.
4. **Operations:** retain owner-managed Monday–Friday, 8 a.m.–5 p.m. Alberta local
   support. Settle holiday/urgent escalation and perform an actual owner response
   walkthrough plus required field acceptance. No SLA targets/credits are invented.

Executed terms and private business/customer evidence stay outside Git. The
business postal address stays out of the website and public repository. Customer
processing authority and signatures remain customer-onboarding matters. DL-023
exclusions, human merge review and protected production release controls remain.
Privacy/operations approval files stay unapproved until their actual evidence
passes; this change does not lower those standards to make a launch check green.
