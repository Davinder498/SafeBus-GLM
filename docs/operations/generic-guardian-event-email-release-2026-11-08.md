# SafeBus generic guardian pickup/drop-off email — release and privacy boundary

**Owner approval:** November 8, 2026.  
**Implementation:** Separate code PR following the Firebase FCM provider-text fix and supplier documentation review.  
**Status:** Code/review candidate only. No Netlify production deployment, Resend account change, historical message deletion or district agreement publication was performed by this milestone.

## Exact change

The existing Netlify `guardian-notification-email.mjs` worker still obtains an authenticated, service-role-eligible notification from the database and sends to the already authorized recipient. Only the **external email rendering** for these two event types changes:

| Event | Email subject | Fixed email message |
| --- | --- | --- |
| `student_picked_up` | `SafeBus: Pickup recorded` | `A pickup event has been recorded. Sign in to SafeBus to view details.` |
| `student_dropped_off` | `SafeBus: Drop-off recorded` | `A drop-off event has been recorded. Sign in to SafeBus to view details.` |

For these two events, the external subject, plain text and HTML **never use the incoming database title or body** and do **not include the recorded event timestamp/timezone**. This prevents student names, bus/route/stop names, coordinates or identifiers embedded in the original title/body from being sent in those email fields. The recipient address and delivery metadata still go to Resend in the United States; the event type is inferable from the subject and delivery record. This is data minimization, **not** an assertion of anonymous email or Canada-only processing.

The **signed-in, role- and tenant-authorized inbox** retains the complete recorded event details. No SQL/RPC, guardian eligibility/consent, scheduled cadence, message outbox, worker retry/lease, idempotency, source event history, Supabase Auth invitation/recovery email, operations alerts, website business inquiry, driver-assignment email or non-pickup event copy changes are included. Existing queued but **not yet delivered** pickup/drop-off emails get the new generic text **only after deployment**; previously delivered provider/mailbox copies are not retroactively redacted.

## Verification and release controls

1. Unit and integration tests must establish that full Unicode/HTML names, bus numbers, route/stop locations and timestamps remain in the authorized source inbox but cannot appear in the external pickup/drop-off email subject/text/HTML or captured Resend HTTP JSON. Also verify both event types, unchanged driver operations email and failed/revoked access denial, event delivery and idempotency.
2. Run the existing CI, unit, isolated PostgreSQL, browser/mobile and security suites. A merged PR is not proof of production deployment, provider acceptance or legal/privacy launch approval.
3. Netlify's supported CLI deploys a **site artifact with its functions**, not an isolated function via a `functions:deploy` subcommand. Existing `.github/workflows/release-production.yml` requires **privacy/map/operations/pilot approvals** and a protected production authorization; do not bypass these gates or falsely set readiness to approved just to distribute this fix. A connected Git site may automatically publish the production branch; inspect Netlify continuous deployment and the current deploy before approving the merge.
4. Release only with legitimate authorized production change control and a tested rollback plan. Verify the published Netlify function bundle actually uses generic copy; use isolated synthetic identities and **no real student names** for a controlled email delivery test when authorized.
5. After real deployment, reconcile public guardian notices, district supplier appendix and Google Play privacy disclosures. An existing supplier-disclosure PR that says emails **can** contain full student names accurately describes the *pre-release* behavior and should not be treated as post-release verification. Obtain the school authority's lawful notification purposes and actual Resend account/US processing approval independently.

**Do not claim a vendor's DPA is missing solely because it lacks an extra signature.** Resend says its DPA is pre-signed and executed on signup, available in the account Documents section. Actual business account identity, supplier flow review, geographic scope, retained messages and customer authorization remain outstanding.

**Readiness:** All school-authority agreements, privacy/legal decisions, pilot authorization and deferred real-device Android tests remain separate. This is not permission to publish the draft MSA/DPA, change temporary Stripe prices or enable destructive retention.
