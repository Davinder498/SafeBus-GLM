# SafeBus commercial launch code review — 9 November 2026

**Decision: NO-GO for the requested broad commercial launch.** The target is 500 school authority accounts, 5,000 buses, and 500,000 guardians. Several shipped functions work in local tests, but the production implementation and operating controls do not yet support a claim of readiness at this scale.

This is a code and live configuration review, not a conclusion drawn from milestone documents. Findings below reference executable source, hosted function definitions, database catalogs, provider API observations, or reproduced browser behavior. A pending migration, passing mocked test, or historical delivery record is not treated as a deployed feature or complete journey.

Reviewed source: [`49f22faea182a292b1964c2c390ad69a0150965e`](https://github.com/Davinder498/SafeBus-GLM/tree/49f22faea182a292b1964c2c390ad69a0150965e). `origin/main` was fetched; clean local `main` was fast-forwarded to this commit. The review branch is `codex/commercial-launch-review-20261109`. A second fetch found no intervening main update. Netlify independently reported this same commit as the published production deployment, published at 06:21:28 UTC on 9 November.

No application logic, production data, permissions, subscriptions, recipient preferences, or deployment settings were changed during this review. No announcements, test emails, push messages, production fixtures, resets, or production load tests were sent or run. Business decisions and human merge/release approval remain with the owner.

## Findings and complete remediation

P1 means resolve before this commercial launch. P2 means a functional, security, or verification gap that must be corrected or explicitly bounded before affected customers are admitted. P3 is a smaller interface inconsistency. These are review findings, not claims that remediation has been implemented.

### 1. P1 — Production GPS commits still include synchronous guardian fan-out

**Evidence.** The hosted `driver_trip_current_locations` trigger calls `safebus_private.notify_tracking_location_change()`, which calls `broadcast_route_tracking_invalidation()`. That function selects distinct linked guardian profiles and loops over `realtime.send` calls inside the GPS transaction. This matches the behavior in [0030_secure_trip_tracking_realtime.sql:122](../../supabase/migrations/0030_secure_trip_tracking_realtime.sql), with the helpers subsequently moved to the private schema. The hosted database has no `safebus_private.tracking_invalidation_queue`, no asynchronous dispatch function, and no tracking invalidation cron job. Its only cron job is the push dispatcher.

[0125_async_tracking_invalidations.sql:58](../../supabase/migrations/pending/0125_async_tracking_invalidations.sql) prepares a durable queue and a bounded worker. It is **not installed**. Its successful embedded-Postgres tests do not change that fact.

**Impact.** A GPS transaction's work grows with the guardian audience. The three-second native cadence creates approximately 1,667 submissions/second with 5,000 active buses. Assuming all 500,000 guardians are linked to an operating route, the current loop can attempt approximately 166,667 guardian invalidation sends/second, even though many guardians are not viewing the app. This is a workload estimate, not a measured throughput result. Linked-route distribution and duplicate route activity can change the rate.

**Solution I can implement.** Reconcile the current hosted trigger/functions against the pending asynchronous design; review its prerequisites, recovery and rollback; make GPS commits enqueue/coalesce a dirty trip marker; perform audience expansion in bounded, fair background batches. Preserve private topics, current link authorization, and coordinate-free messages. The existing proposed 250-message/second worker budget is itself too small for the stated population if per-guardian broadcasts retain a three-second target: redesign/coalesce the delivery contract and measure it rather than simply applying 0125 and declaring capacity solved. Bound consumer refresh rates, spread periodic requests with jitter, and evaluate an authorized bus-scoped invalidation design without exposing unrelated riders.

**Completion evidence.** Verified protected deployment of the queue/worker; ingestion latency independent of audience size; measured queue age and drain rate under hot-authority, normal, peak and reconnect workloads; no cross-authority/sibling duplication; no coordinates or child identity in messages. Required provider quotas and compute must be verified against the measured workload.

**Owner input.** Approve the live-update freshness target and capacity qualification budget. A controlled full-scale test needs an explicitly approved isolated load target; the existing production authorization permits bounded verification, not a 500,000-user load test.

### 2. P1 — Retention is disabled, and its configured maximum cannot sustain this fleet

**Evidence.** Hosted `retention_execution_control` has `destructive_enabled=false`, no approval timestamp and no approval reference. Netlify has no production `SAFEBUS_RETENTION_LIFECYCLE_EXECUTE=true`. [retention-lifecycle-scheduled.mjs:91](../../apps/web/netlify/functions/retention-lifecycle-scheduled.mjs) therefore stays in dry-run mode. The legacy daily runner explicitly uses `const dryRun = true` in [safebus-retention-scheduled.mjs:72](../../apps/web/netlify/functions/safebus-retention-scheduled.mjs).

There is also a separate capacity defect: [netlify.toml:56](../../netlify.toml) runs the lifecycle worker once/minute; [retention-lifecycle-scheduled.mjs:115](../../apps/web/netlify/functions/retention-lifecycle-scheduled.mjs) performs at most four batches of 500 per class. Hosted `run_retention_lifecycle` enforces the same 500-row limit, as in [20261105194609_complete_automatic_disposal.sql:325](../../supabase/migrations/pending/20261105194609_complete_automatic_disposal.sql). The theoretical GPS maximum is **2.88 million rows/day**, before timeouts, preservation work or contention. The hosted GPS policy is 30 days.

**Impact.** At the shipped cadence, 5,000 buses produce six million history rows per operating hour, or 24 million for an assumed four-hour operating day. Merely turning execution on would still leave an unsustainable deletion backlog. Thirty such operating days represent 720 million history rows; this is a sensitivity calculation, not an observed dataset or a claim that all calendar days are operating days.

**Solution I can implement.** Qualify the lifecycle/archives/holds and recovery path against the current hosted schema, then release activation through the protected workflow. Replace the fixed global deletion budget with a measured, bounded design that exceeds sustained arrivals and catches up safely. Evaluate time partitioning, indexed expiry scans, smaller transactions and a dedicated drain worker; retain record-level holds, archive verification, dependent-record protection and recovery evidence. Do not drop a partition containing held records. Measure retention lock effects on live GPS writes before activation.

**Completion evidence.** A rollback rehearsal and recovery evidence; protected activation; actual scheduled deletions of reviewed disposable synthetic records; held/unexpired records preserved; oldest-expired-record age and backlog alerting; sustained drain capacity above daily arrivals. Do not test removal of existing customer records.

**Owner input.** Confirm the disposal/preservation business policy and final destructive activation approval. This is separate from the notification privacy approval already given; no repeated notification approval is needed.

### 3. P1 — Live release controls do not enforce the required human review path

**Evidence.** GitHub's branch-protection API reports `required_approving_review_count=0` for `main`, although status checks and administrator enforcement are enabled. The protected [release-production.yml:27](../../.github/workflows/release-production.yml) exists, but its workflow run list is empty. Netlify reports the published deployment has a build ID, `manual_deploy=false`, repository/branch `SafeBus-GLM/main`, and active continuous builds. [netlify.toml:2](../../netlify.toml) runs `pnpm build`; that is not the protected release preflight.

**Impact.** Green CI can allow a merge without an approving review, and the connected Netlify build path can publish main independently of the intended GitHub production environment review and release attestation.

**Solution I can implement.** Require at least one approving human review and stale-review dismissal; ensure the last contributor cannot supply the only approval. Keep required checks. Configure production publishing to consume only the approved exact-commit artifact through the protected release path; disable automatic production publication from the alternate build path while retaining safe previews. Include the native Android job among required checks if Android changes are release-blocking. Verify that unsigned/unapproved commits cannot publish, using read-only settings and a safe rejected-release test rather than releasing a dummy production version.

**Completion evidence.** Read-back of branch/environment/Netlify controls and one real reviewed release with commit-bound preflight, recovery, deployment and post-release verification evidence.

**Owner input.** Name the human reviewers and approve the final merges/releases. I can configure the agreed controls; I cannot provide the owner's human approval.

### 4. P1 — Preview builds have the same privileged production and archive secrets

**Evidence.** A read-only Netlify environment comparison found `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SAFEBUS_RETENTION_ARCHIVE_KEYS` available to deploy previews with values identical to production. The Supabase secret and archive key are also scoped to `all` contexts; build scope is included. No secret values were printed or retained in the report. This repository is public.

**Impact.** Unreviewed preview/build code receives credentials that can operate on the sole production database or decrypt retained archives. This expands the production trust boundary beyond the protected release workflow. This review did not attempt secret extraction or establish whether Netlify's separate untrusted-fork approval rules would block a particular external PR.

**Solution I can implement.** Restrict production administrative keys to the production runtime and the approved release steps that need them. Remove them from previews, branch builds and dev-server contexts; restrict archive keys separately. Use local synthetic mocks and unavailable-safe endpoints for preview work until a separately authorized non-production service exists. This does not require creating another database. Check Netlify's untrusted deploy controls and review historical build access. Rotate keys through the recovery/release process if that review identifies untrusted exposure; do not claim a breach without evidence.

**Completion evidence.** Redacted context/scope comparison; preview build with no production secret present; production functions continue working; archive recovery still succeeds from approved custody.

**Owner input.** No repeat account permission is needed. Any decision to accept a temporary exposure or purchase an additional environment is a business decision; the recommended fix does not depend on a second database.

### 5. P1 — Guardian home keeps stale active status and linked data

**Evidence.** [ParentDashboardPage.tsx:40](../../apps/web/src/pages/ParentDashboardPage.tsx) fetches visibility/stops in an effect depending only on `appSurface`. It does not use the verified refresh hook, subscribe to tracking invalidations, refresh on foreground/online, or clear data on offline. Its green badge is derived from the initially returned state.

**Reproduced.** A local-only browser diagnostic loaded an active bus, advanced 31 seconds, and switched offline. The visibility RPC count remained one and the green **Active** badge remained visible. [View the synthetic-record screenshot](commercial-launch-review-2026-11-09-assets/guardian-home-stale-offline.png). This used synthetic records and no hosted writes. A server-side permission boundary still applies to later requests; the defect is retained stale UI, not proof that RLS permits new unauthorized reads.

**Solution I can implement.** Move guardian home to an identity-bound, abortable verified data loader; revalidate on foreground/online and relevant private events; clear or explicitly mark unverified information after disconnection, timeout, logout or scope change. Provide a direct retry action for initial failure. Keep the refresh behavior within the capacity budget from finding 1. Do not introduce a stale authorized-data cache as an offline substitute.

**Completion evidence.** Regression journeys for trip end/pause, access expiry/revocation, offline/online, identity switch, unmount and delayed/out-of-order responses. The active badge and linked data must stop claiming current verification after its freshness boundary.

**Owner input.** None for the fix; agree the freshness contract with finding 1.

### 6. P1 — Application incidents are observed without paging operations

**Evidence.** Production Netlify sets `SAFEBUS_APPLICATION_MONITOR_MODE=observe`. [production-health-scheduled.mjs:80](../../apps/web/netlify/functions/production-health-scheduled.mjs) logs application failures in that mode but excludes them from the failing/paging check list. Database, GPS freshness, email/push backlog, delivery failures and actual map-tile probes are implemented in [production-application-signals.mjs:1](../../scripts/lib/production-application-signals.mjs). GitHub's health workflow primarily tests public shell/configuration availability.

**Impact.** A public website can remain green while core bus visibility or notification delivery is degraded. Existing public-health alerts do not cover that gap.

**Solution I can implement.** Validate the fixed aggregate probes and thresholds, activate application alert mode through reviewed production configuration, and verify routing, deduplication, escalation and recovery. Add capacity-relevant queue-age, ingestion latency and retention backlog signals. Test failure injection locally and use approved operations-only alert validation; do not send notifications to app recipients as QA.

**Completion evidence.** Source-bound production observation in alert mode, operator receipt of approved operations alerts, and a resolved/recovery observation. Log statements alone are not receipt evidence.

**Owner input.** Name primary/backup operations contacts and set response hours, escalation and customer service targets. The engineer owns implementing and verifying the monitoring.

### 7. P1 — Subscription risk events are absent from both code and live Stripe configuration

**Evidence.** [stripe-webhook.mjs:12](../../apps/web/netlify/functions/stripe-webhook.mjs) handles subscription, invoice, checkout and schedule lifecycle events, but omits `charge.refunded`, `charge.dispute.created` and `radar.early_fraud_warning.created`. Unsupported events return success before a durable receipt at line 96. The live enabled Stripe webhook endpoint has the same omissions.

**Impact.** SafeBus has no application-level reconciliation/operations path for a completed refund, chargeback or fraud warning that does not itself change subscription status. A refund does not automatically mean a school bus service should be shut off; the business policy is currently missing from this integration.

**Solution I can implement.** Add signed, idempotent risk-event ingestion and a version-correct charge/payment/invoice/subscription ownership lookup. Persist a restricted billing incident/audit result and notify the authorized billing operator. Reconcile full/partial refunds and dispute outcomes separately from normal subscription status. Update the live endpoint only after the handler is reviewed and deployed. Initially keep a human response path rather than automatically disrupting transportation.

**Completion evidence.** Sandbox replay of duplicate, reordered, unrelated-product, partial/full-refund, dispute and warning events; correct authority mapping; no frontend secrets or cross-authority reads; read-back of the production event subscription. No live charges or refunds were performed in this review. [Stripe's subscription webhook guidance](https://docs.stripe.com/billing/subscriptions/webhooks) describes the lifecycle and risk-event integration boundary.

**Owner input.** Decide refund entitlement, suspension/continuity and fraud/dispute response policy. I can implement the chosen behavior and operational tooling.

### 8. P1 for broad launch — Recipient access is mobile-only, with testing-only Android distribution and no iOS route

**Evidence.** [AuthContext.tsx:83](../../apps/web/src/contexts/AuthContext.tsx) restricts website access to administrator roles and mobile access to guardian/driver roles. [MobileAppLinks.tsx:1](../../apps/web/src/components/ui/MobileAppLinks.tsx) advertises Android testing requiring an invitation and has `ios.url=null`. Invitation completion directs recipients to the mobile app in [MobileAccountReady.tsx](../../apps/web/src/components/auth/MobileAccountReady.tsx). The code and [live public UI screenshot](commercial-launch-review-2026-11-09-assets/production-login-390.png) agree.

**Impact.** An invited guardian with only an iPhone has no supported operational portal. An ordinary Android recipient may require separate Play testing access. A broad commercial launch cannot assume every newly invited recipient can install and use the service.

**Solution I can implement.** Complete the reviewed signed Android production-distribution path and version-bound physical acceptance. For iPhone recipients, scope and implement either a supported web guardian experience or an iOS app with its own security/location/push/distribution qualification. Updating the store-link label does not supply that missing capability. Do not represent the current browser mobile entry point as a published iOS app.

**Completion evidence.** A newly invited ordinary recipient can install from the actual production distribution channel, activate, sign in, recover a password and use permitted features without an undisclosed tester allowlist. Repeat on each promised platform.

**Owner input.** Decide the promised device coverage and fund/prioritize the missing recipient channel. The requested broad launch is the assessment baseline; a restricted Android pilot would be a different business release scope.

### 9. P2 — Some administration selectors silently truncate at scale

**Evidence.** [studentGuardianService.ts:26](../../apps/web/src/services/studentGuardianService.ts) loads active guardians with one unpaginated table request. [StudentGuardianManager.tsx:36](../../apps/web/src/components/admin/StudentGuardianManager.tsx) uses that result as the complete existing-guardian dropdown. Any finite Data API row cap can hide later guardians without an error or another page. The actual hosted row cap was not independently obtained in this review; this is not a claim that a particular current account already exceeds it.

Separately, [adminOrganizationService.ts:104](../../apps/web/src/services/adminOrganizationService.ts) explicitly limits driver profiles to 250. Driver rows are fully paginated elsewhere, so [BusWorkspaceForms.tsx:315](../../apps/web/src/components/admin/BusWorkspaceForms.tsx) can display later choices using employee number or repeated `Driver` fallback labels; the substitute-driver page can show raw IDs.

**Solution I can implement.** Extend the existing scoped, paginated reference-picker contract to guardians and remaining driver selectors. Return ID plus an unambiguous display label from the same server response; load an existing selection explicitly. Avoid downloading an entire authority's people/address/license records just to populate a selector. As a short bounded fix, paginate profiles/guardians deterministically using the existing `collectVisibleRows` utility; server search is the better large-authority UX.

**Completion evidence.** Select/link records beyond a deliberately low mock server cap and beyond 250 drivers; retain selected labels across search/page changes; enforce authority/school scope and duplicate-link constraints on the server. No large production seed is needed.

**Owner input.** None.

### 10. P2 — Leaked-password protection is still disabled in hosted Auth

**Evidence.** The live Supabase security advisor reports `auth_leaked_password_protection`. The protected activation implementation already exists in [auth-password-protection.mjs](../../scripts/lib/auth-password-protection.mjs) and [release-auth-password-protection.yml](../../.github/workflows/release-auth-password-protection.yml). Passing its mocked tests does not enable the hosted setting. Direct Auth management inspection using the session's local management token returned HTTP 401, so I do not claim verification of the remaining Auth/SMTP settings from that API.

**Solution I can execute.** Restore valid management authentication, run the existing protected inspect/enable/verify workflow at the reviewed commit, retain the prior boolean before mutation and read back the result. Preserve the existing password policy and MFA rules. Check plan eligibility if activation is unavailable. [Supabase password-security documentation](https://supabase.com/docs/guides/auth/password-security) describes this additional protection.

**Completion evidence.** Hosted setting verified enabled and advisor finding cleared; current-password/recovery/invitation and MFA behavior still pass.

**Owner input.** Reconnect Supabase management authentication if required, and approve a plan expense only if one is actually necessary. Do not paste keys into chat.

### 11. P2 — One older active school authority still has a pending notification policy

**Evidence.** New-account policy defaults are already correctly `approved` with approval time `now()`, and the hosted creation trigger uses those defaults. Two existing policies are approved; the policy for **Red Deer Public Transportation** remains pending with no approval timestamp. It has one active school authority admin and no current guardian/driver profile in the observed role aggregate. Hosted delivery claimers require approved policies. Thus this is an incomplete account default, not evidence that current recipients are missing messages.

**Solution I can implement.** Review the account's creation/audit history to determine whether pending is an old provisioning artifact or an intentional platform decision. If it is the old default, prepare an exact-ID, expected-before-state repair, rollback and verification through the existing protected operational release. Preserve rejected policies and personal preferences. The owner has already approved standard notification privacy; do not request that approval again.

**Completion evidence.** A bounded reviewed repair, or recorded evidence that the pending state is deliberate. Verify availability without auto-subscribing people or sending QA messages.

**Owner input.** Only clarify this particular account if its intended status cannot be recovered from the account/audit evidence.

### 12. P2 — Verification does not yet prove the complete live service or required scale

**Evidence.** The browser configs use placeholder Supabase settings. Authenticated journeys intercept API responses, for example [commercial-authenticated-e2e.spec.ts:14](../../tests/smoke/commercial-authenticated-e2e.spec.ts). [product-load.spec.ts:8](../../tests/release/product-load.spec.ts) exercises 60 local shell requests. [capacity-workload.mjs:272](../../scripts/lib/capacity-workload.mjs) serves a synthetic HTTP fixture; its report explicitly sets `applicationCapacityVerified=false`. None measures production Auth/RLS/GPS/ETA/fan-out behavior at this target.

An appearance screenshot passed while showing mocked settings errors, including `Sign in required` and an unexpected REST-request message. That is a test-coverage limitation, not a claim those same errors occur in production. Visual/axe success must not substitute for functional assertions.

The unmodified Windows checkout also initially failed three release tests: raw SQL hashes and a generated-type string comparison differ under `core.autocrlf=true`. Restoring those three files temporarily to the exact Git blob bytes made all affected checks pass and the full test command pass. Original checkout line endings were restored afterward. There is no `.gitattributes` defining canonical working-tree bytes for those inputs.

**Solution I can implement.** Add canonical LF attributes for checksum-bound SQL/generated inputs, preserving reviewed migration bytes and checksums. Make text-only comparisons newline-insensitive where appropriate; do not weaken migration integrity checks. Strengthen UI fixtures to fail unexpected required API errors and assert loaded feature content. Prepare a source-event matrix, bounded synthetic live acceptance through the approved existing-database workflow, and a separate realistic capacity qualification plan. The full-scale dataset/load target requires separate approval; no Docker or second database was created during this review.

**Completion evidence.** Clean Windows and Linux checkout checks; exact deployed-version acceptance for every supported role and source event; provider and physical-device results; controlled capacity results with queue, lock, latency, quota and recovery measurements. A review PR cannot supply these results by itself.

**Owner input.** Name physical-device testers, approve the load target/budget and service thresholds, and supply human release approval. I own preparing, implementing, rehearsing and verifying the engineering work.

### 13. P3 — The native full-screen guardian map omits the SafeBus wordmark

**Evidence.** [GuardianLiveMapPage.tsx:97](../../apps/web/src/pages/GuardianLiveMapPage.tsx) renders its own native header with back, bus title and Refresh controls, outside the branded dashboard shell. It contains no `BrandMark`. The dark-map browser screenshot confirms the omission. The black tile surface in that synthetic screenshot is a fixture, not evidence of a production provider outage.

**Solution I can implement.** Add the existing text-only wordmark to the compact header in the appropriate light/dark brand colour. Preserve back navigation, bus identity, touch targets and map space. Verify 320px, landscape, large text, light/dark and unavailable-map states. This does not independently block commercial launch. No owner decision is required.

## Capacity assessment for the stated population

The 500,000 guardians are treated as registered users. Peak simultaneous viewers were not supplied. The following sensitivities prevent treating all registered users as measured concurrent users.

| Concurrent guardians on bus-detail/live-map surfaces | Two-RPC refresh demand at 15 seconds | If each viewer receives a location invalidation every 3 seconds |
| --- | ---: | ---: |
| 5,000 (1%) | about 667 RPC/s | about 3,333 RPC/s |
| 50,000 (10%) | about 6,667 RPC/s | about 33,333 RPC/s |
| 500,000 (100%) | about 66,667 RPC/s | about 333,333 RPC/s |

These are alternative operating cases, not a sum or a benchmark. Slow requests, the one-follow-up rule and hidden-tab behavior can reduce offered requests while increasing staleness. Parent home currently does not poll at all, which is finding 5, not a capacity optimization to preserve. Sources are [useVerifiedGuardianData.ts:6](../../apps/web/src/hooks/useVerifiedGuardianData.ts), [GuardianBusDetailPage.tsx:65](../../apps/web/src/pages/GuardianBusDetailPage.tsx) and [trackingInvalidations.ts:26](../../apps/web/src/lib/trackingInvalidations.ts). The 150ms invalidation coalescer does not combine successive three-second GPS signals.

Native cadence is defined by [TrackingCadence.java:5](../../apps/mobile/android/app/src/main/java/com/safebusalberta/app/tracking/TrackingCadence.java). Hosted native ingestion inserts history, upserts current location, and updates device/session last-seen rows: at least roughly 6,667 row mutations/second at 5,000 buses, before triggers, indexes, notification source events and offline catch-up.

The current provider plan, purchased compute and custom Realtime quotas were not independently verified; no plan capacity is assumed. [Supabase documents separate connection, message and join limits](https://supabase.com/docs/guides/realtime/limits). Provider quota approval, performance measurement and ongoing cost must accompany the architecture change. Map configuration returning 200 does not measure tile quota for these populations. Peak source-event notifications, reconnect bursts, large-authority skew, archive/retention contention and at least a full morning/afternoon soak belong in qualification.

## Role acceptance contract and current evidence

| User type | Required permitted behavior | Required boundary/failure behavior | Evidence achieved here |
| --- | --- | --- | --- |
| School authority admin | Web onboarding, mandatory MFA, agreements, billing/trial/bus allowance, school/people/transport operations, scoped broadcasts; personal in-app preferences | Other authorities denied; recipient consent retained; no Android administrator push capability | Source and mocked UI reviewed; deployed source/settings inspected; complete fresh live onboarding not exercised |
| School-scoped admin | Current code rejects the retired `school_admin` role | No accidental fallback to guardian or full-authority privileges | Rejection found in code and hosted role helper; no active account exists. Any promise of this role needs a separately scoped product decision |
| Transportation admin | Web operational pages/assignments, trip and operational alerts, permitted announcements and limited preservation controls | No billing/authority-admin powers or other-authority data; mandatory MFA | Mocked UI and source reviewed; no live transportation-admin profile was present, so no claim of live journey verification |
| Guardian | Mobile own linked students/buses, Pickup & drop-off, Trip updates, Operational alerts; in-app and opted-in enabled email/push channels | No unrelated student lists, expired links or other authorities; opt-outs/quiet hours/device permission; optional MFA enforced after enrollment | 123-test mobile suite includes relevant flows; four hosted missing-identity/anonymous assertions; stale-home defect reproduced. Real recipient-channel receipt not tested |
| Driver | Mobile own/authorized bus/trip and manifest operations; Assignment alerts, Trip updates, Operational alerts; recipient channel choices | Invalid QR/device/session/scope denied; collection stops on pause/end/logout; optional MFA enforced after enrollment | Mocked browser and native local checks; no physical driving/background/battery/permission verification in this review |
| Platform admin | Web authority invitations/lifecycle, contracts/pricing/platform support and platform inbox; mandatory MFA/recent-auth for sensitive actions | No ordinary authority transportation/student portal or recipient preference override | Source and mocked UI; production release-control discrepancy found; no live mutation performed |

Authoritative categories are in [notificationCategories.ts](../../apps/web/src/utils/notificationCategories.ts). Guardians/drivers may use all normal permitted features without enrolling MFA. The hosted API pre-request guard is installed as `safebus_private.enforce_active_api_session`, and its code preserves that distinction. Restricted table policies and the pre-request guard cover checks that would not be evident from looking at one RPC body alone.

## Verified strengths and limits

- The production source matches the reviewed commit. Public HTTPS pages respond and expose expected security headers; the map configuration endpoint responds with the configured provider contract. Fixed read-only tile probes using both web and native-origin configurations returned HTTP 200 with valid PNG signatures; native configuration returned the expected CORS origin. These are not quota or physical-WebView tests. Unauthenticated GETs to mutation endpoints return 405.
- All 57 public base tables have RLS enabled. The catalog contained 230 public policies and 433 public/private function definitions. No public `SECURITY DEFINER` function was executable by `anon` in the catalog check. This is not a proof that every possible authorized query is correct.
- The live health advisor returned no findings. The security advisor's 162 authenticated-definer notices are review prompts, not 162 confirmed vulnerabilities. Private service-only tables having RLS without ordinary user policies is intentional denial, not a reason to open them.
- The hosted API pre-request session/MFA guard and restrictive policies are present. Direct `user_sessions` mutation columns were not granted to `authenticated`. Several apparent bypass concerns were cleared by checking these actual dependencies.
- The reviewed rollback-only, read-only guardian check passed four assertions for anonymous and missing-identity denials. It does not cover every role, tenant pair or enrolled MFA device.
- Notification defaults are correct for new accounts; personal consent/device choices remain separate. Source push copy is generic and private information stays in the authenticated inbox.
- Push cron had 4,313 successful runs in the observed trailing-day aggregate. Outbox history contained 60 push `delivered`, three push `failed`, 33 email `delivered`, and seven email `cancelled`. These are existing worker records, not new QA deliveries or proof of physical display/mailbox receipt. No current pending queue was seen in that aggregate.
- Stripe has an enabled live endpoint, two active CAD inclusive recurring prices and an active Canadian tax registration. Actual paid invoices, refund outcomes and customer tax treatment were not transacted or certified here. Provider key presence alone is not proof of permissions or deliverability.
- Production dependency audit reported no known production dependency vulnerabilities; migration verification accepted 125 immutable files. Supabase performance advice included 53 unindexed foreign keys, nine RLS initplan notices and 25 multiple-permissive-policy notices. These require workload/query-plan triage; blindly deleting the 161 currently unused indexes would be inappropriate on this small prelaunch dataset.

## Validation results

Results and the exact first-run/recheck distinctions are recorded in `commercial-launch-review-2026-11-09.json` beside this report. Local raw logs are under `artifacts/launch-review-20261109`; sensitive operational schema snapshots and browser traces remain in the ignored `.codex-artifacts/launch-review-20261109` directory.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed |
| `pnpm build` | Passed, with bundle-size warnings |
| `pnpm test` | First Windows checkout: three line-ending-sensitive failures; canonical Git bytes: passed, 1,178 web tests, 32 mobile tests and 506 release assertions/subtests |
| Production dependency audit | Passed |
| `pnpm migrations:verify` | Passed, 125 immutable files |
| Web browser suite | First run: 383 passed, seven skipped, two failed; both isolated rechecks passed. First-run instability remains recorded; no clean single-run all-green claim |
| Mobile browser suite | 123 passed |
| Appearance/WCAG suite | First run: 21 passed, eight intentionally skipped, one navigation timeout; isolated transportation-admin recheck passed |
| Built-bundle route loading/recovery | 10 passed |
| Additional read-only production public UI | Seven public/protected-denial routes at 1280, 390 and 320px; first run 19 passed, two diagnostic locator failures; both corrected visible-wordmark rechecks passed. No axe violations/overflow or page errors in those exercised states |
| Guardian stale-home diagnostic | Reproduced the defect; one diagnostic passed by asserting the incorrect retained Active badge |
| `pnpm --filter @safebus/mobile build` | Passed |
| `pnpm --filter @safebus/mobile cap:sync` | Passed after successful mobile build |
| Native `testDebugUnitTest assembleDebug lintDebug` | Passed using Android Studio's bundled Java; 420 Gradle tasks, 65 executed |

The default shell did not initially find Java; the installed Android Studio JBR resolved that local tooling issue. No APK was installed, no AAB was published, and no physical-device acceptance was performed. Automated axe checks cover detectable rules on exercised states, not a complete accessibility certification. Screen-reader, actual touch/keyboard behavior and physical Android lifecycle remain manual checks.

## Manual and controlled live verification still required

I can prepare fixtures, scripts, event matrices and evidence capture. The following are release qualification, not requests for the owner to debug or execute SQL:

1. **Fresh school authority journey:** real approved installation/onboarding path, first-admin invitation/password/MFA, agreements, trial/subscription/allowance, school and transport setup, recipient invitation and role-specific entry. Include expired, cancelled, duplicate and failed-provider recovery. Use scoped synthetic identities and approved mailboxes, not existing people as fixtures.
2. **Authorization:** paired authorities, retired school admin, transportation admin, guardian and driver at AAL1 without enrollment and AAL1/AAL2 after enrollment; revoked/expired sessions, guardian access expiry and suspension. Prepare/review statements and triggers before bounded rollback tests; no public policies or guard bypasses.
3. **Source-event delivery:** creation/change/end of assignments, start/pause/end/cancel trip, pickup/drop-off, operational incidents, announcements and access changes. Trace source event to authorized audience to inbox and opted-in enabled channels; test quiet hours, permission denial, opt-out and retry deduplication. Local provider doubles can cover cases without sending external QA notifications. Any actual end-to-end external receipt needs the separately reviewed allowlisted synthetic-recipient procedure; never send real announcements or notifications to real users as QA.
4. **Physical Android:** newly installed and upgraded signed release; QR camera fallback, Android permission denial/revocation, precise/approximate location, background/locked screen, network loss and long queued recovery, battery saver, reboot/force-stop, app/account switch, lost-phone revocation, stop/end privacy boundary and push tap after process death. Test representative supported Android versions and low-end phones. Drivers must not operate a phone while driving; use a stationary/operator-assisted protocol.
5. **Billing:** sandbox first checkout/14-day trial, paid conversion, invoice/tax, failed payment, bus-limit changes, scheduled downgrade/cancellation, portal return, webhook replay and risk events. A real commercial purchase/invoice is an owner-authorized transaction, not an implicit QA charge.
6. **Capacity and recovery:** approve a realistic load target and concurrency/SLO envelope; exercise actual Auth/RLS/RPC/Realtime, native catch-up, uneven authorities, notification fan-out, retention/archive locks and provider quotas. Run a clean backup/restore and app recovery qualification with retained evidence. Do not load-test the sole production project under the current bounded-verification authorization.

## Proposed delivery order and owner decisions

Work one reviewed milestone at a time:

1. **Contain production access and release risk:** preview secret scope, human-review enforcement, protected publishing and hosted password protection. Prepare concrete configuration diffs and recovery before review.
2. **Correct recipient usability:** guardian home freshness, complete reference selectors and deterministic tests. Submit a feature-branch PR with the role acceptance matrix and regression evidence.
3. **Complete operations and billing:** qualified retention activation and sustainable draining, application paging, bounded old-account repair, refund/dispute/fraud workflow. Use protected database/config releases, rollback rehearsals and post-release checks.
4. **Qualify commercial scope and scale:** finalize recipient distribution/platform coverage, physically verify the signed Android release, then measure the actual target workload and complete fresh-account/source-event acceptance. Do not call any earlier milestone commercial launch completion.

The owner decides platform coverage, peak concurrent viewers and live freshness/service targets, capacity/provider spend, refund/continuity policy, disposal business approval, operations staffing and final human merge/release approval. I can own the code/configuration fixes, hosted-schema reconciliation, rollback/recovery preparation, protected rollout execution and technical evidence. The sole production database remains the authorized target for reviewed bounded fixes; a second database is not a prerequisite to those fixes. A large-scale test environment is a separate capacity decision.

No code-only review can establish signed supplier/legal agreements, insurance, a legally sufficient privacy program or commercial operating capacity. This report does not treat documents claiming those items as proof, and does not invent their completion. Resolve the concrete technical blockers and collect the missing live/manual evidence before approving broad commercial launch.
