# Launch milestone 1: complete user journeys

Status: in progress. This record addresses APP-01 and part of SEC-02 in the
[commercial-readiness review](commercial-readiness-review-2026-10-15.md).
It does not close hosted acceptance or approve launch.

## Acceptance behavior

| User                   | Permitted behavior and scope                                                                                                                                          | Failure behavior                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| School authority admin | Invite permitted members and administrators, manage their own authority and subscription with required MFA.                                                           | Unconfirmed account/billing actions show an error; no success, automatic retry or removal of a pending billing request. Other authorities remain inaccessible.      |
| School-scoped admin    | Follow the current district-only product decision, DL-025. Individual-school administrator sign-in/invitations are retired; historical identifiers remain compatible. | Reject the retired role. Do not restore it or silently promote it as part of verification. Its prepared database enforcement requires a separate protected release. |
| Transportation admin   | Use permitted transportation operations within their own authority; retain the narrower personal-data permissions.                                                    | Deny school authority subscription and administrator-account controls that require the school authority admin.                                                      |
| Guardian               | Use the mobile app, linked-student bus visibility and personal notification choices. Optional MFA becomes enforced after enrollment.                                  | Deny administrator/driver operations, unrelated students and unavailable buses. Clear previously verified details when authorization cannot be rechecked.           |
| Driver                 | Use the mobile app for their permitted assigned trips and personal notification choices. Optional MFA becomes enforced after enrollment.                              | Deny administrator/guardian operations and unauthorized assignments. Do not claim that an offline trip action is confirmed before server confirmation.              |
| Platform admin         | Use the website with required MFA for authorized authority provisioning and account controls.                                                                         | No false invitation, lifecycle or recovery success after a malformed response. Platform controls do not grant routine access to school authority student records.   |

Notification acceptance must preserve the recipient's category choices, quiet
hours, Android permission, authorization and account status. Website/in-app
presentation, email and Android push are separate channels; passing an inbox
test does not establish delivery from the original event. Do not send external
notifications or real announcements as QA.

## Repairs in this change

- Onboarding previously accepted HTTP-success HTML, unreadable JSON and empty
  confirmations. Some forms could announce success or clear the review despite
  having no confirmed result. Require a structured confirmation, retain explicit
  server rejections and show a safe uncertainty message after network failure.
  Keep duplicate-field feedback and do not automatically retry mutations.
- Billing previously accepted unreadable/empty responses and cleared the saved
  request identifier. Retain the identifier until the mutation is acknowledged
  (`ok: true`, or a checkout URL). A retry uses the same identifier and payload.
  Preserve explicit non-retryable server rejections. No prices, tax settings,
  authorization rules, Stripe API calls or subscription terms change.
- No migration, persistent database write, provider configuration change or
  protected release is part of this PR. Protected releases remain last under
  the owner's revised milestone order.

## Verification and limits

- Before the repairs, focused regressions reproduced 18 onboarding failures and
  seven billing failures. After the repairs, all 39 focused service tests pass.
- The onboarding browser suite passed 30 checks across desktop and phone
  viewports, including unclear responses, preserved form details and explicit
  retry. All accounts and responses are synthetic.
- The billing browser suite passed 22 checks across desktop and phone viewports,
  including unclear cancellation responses and retry with the same identifier.
- Before these repairs, the baseline product-verification command passed 17
  website and 24 mobile browser checks. The duplicate phone invocation of the local load check was
  intentionally skipped. This is local regression evidence, not hosted capacity
  or physical-phone evidence.
- On 2026-11-04, bounded live read-only checks confirmed the official invitation
  origin is allowed, restrictive session policies cover the public RLS tables,
  and the API session hook is installed.
- The reviewed guardian read-only procedure passed its four anonymous and
  missing-identity denial assertions. It used transaction-local roles/claims,
  statement/lock timeouts and final rollback, without fixtures or user records.
- Browser inventory is reachable, but opening the SafeBus tab fails with
  `Cannot read properties of undefined (reading 'timeoutMs')`. No live browser
  sign-in, invitation delivery, MFA or signed-account journey is claimed.

The existing BusSafe project remains production. Current owner instructions
authorize reviewed bounded verification there; a second database is not a
prerequisite. This does not authorize blanket fixture runners, uncontrolled
writes, real QA notifications, resets or bypassing protected release approval.

## Still required before closing this milestone

- Hosted signed-session acceptance for each permitted role: normal sign-in,
  MFA/enrollment, refresh, expiry, revocation, account switching and sign-out.
- Positive and negative authority/guardian/driver boundaries, including an
  already-open live subscription after permissions are revoked.
- Reviewed onboarding/invitation activation and duplicate/concurrent request
  acceptance without contacting real recipients as QA.
- Source-event notification delivery acceptance, separate from mocked inbox
  presentation and provider configuration checks.
- Billing provider acceptance for checkout, plan changes, cancellation,
  invoices and applicable taxes without real financial charges as QA.
- Verification of every dependency deliberately deferred to the protected
  release milestone. Prepared SQL and merged PRs do not establish live behavior.
