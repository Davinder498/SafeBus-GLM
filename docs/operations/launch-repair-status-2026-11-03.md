# Launch repair status — November 3, 2026 (Alberta)

This is a factual reconciliation, not commercial launch approval. No approval,
physical-device result, provider agreement or store review has been invented.

Final UI acceptance before the small focus repair: for every supported portal,
closing the mobile navigation drawer returns focus to the same control that
opened it. Capture that control when opening, rather than reading a potentially
changed ref during cleanup. No role, scope, authentication or channel changes.

## Source repairs

| Repair | Review |
| --- | --- |
| Guarded retention preview correction and protected release target | https://github.com/Davinder498/SafeBus-GLM/pull/361 |
| Date-effective current driver coverage; scheduled coverage shown separately | https://github.com/Davinder498/SafeBus-GLM/pull/362 |
| Live RPC inventory reconciled without broader grants | https://github.com/Davinder498/SafeBus-GLM/pull/363 |
| Safe password feedback, app download guidance and technical UI cleanup | https://github.com/Davinder498/SafeBus-GLM/pull/364 |
| Scoped detail requests, complete pagination and searchable references | https://github.com/Davinder498/SafeBus-GLM/pull/365 |
| Durable offline stop intents and atomic own-trip replay | https://github.com/Davinder498/SafeBus-GLM/pull/366 |
| Protected leaked-password Auth configuration release | https://github.com/Davinder498/SafeBus-GLM/pull/367 |

At reviewed main `66d5540c7e16b29d78799be965708d9a00b0f93b`, 361–364
are merged by the owner; 365–367 are review
items. Source status and live installation are distinct. Retention and offline
replay need their protected backend runs; source-only changes do not establish
successful live installation. The attempted retention workflow dispatch did not
produce a confirmed new run. Do not bypass the protected workflow.

## Verified external state

- Read-only BusSafe authorization comparison: all 219 application functions match
  the reconciled inventory, with zero authenticated/service audience differences
  and zero anonymous execution grants. No grants or DDL were issued for that check.
- The live public landing page now shows the Android testing listing link and
  the iOS coming-soon status, verified in the browser.
- Play Console: the app is a draft/internal test app. Saved the default listing
  draft with name SafeBus and corrected the old BusSafe description. The short
  description already matched the reviewed copy. No Google submission or public
  rollout was performed. Existing screenshots require refresh against the final
  candidate; the local Chromium download failed, so fresh capture is unverified.
- Google requires at least 12 opted-in closed testers for 14 days before this
  account can apply for production. Console currently shows zero opted-in testers.
  No tester invitations or notifications were sent.
- Android production environment: all six required secret names and the public
  Supabase URL variable are present; required reviewers and protected-branch
  restrictions are enabled. Values were not read. Presence does not verify the
  keystore contents, signature, Firebase setup or a signed release candidate.
- Supabase organization is Free. Leaked-password protection requires Pro or above.
  Dashboard quotes Pro from US$25/month plus applicable usage/tax. No subscription
  change or payment was made; the protected setting-release path is prepared.
- App Store Connect is at Apple sign-in. There is still no iOS native project in
  the repository. iOS native tracking, push, QR, signing, device acceptance and
  store submission remain work; this repair pass does not deliver an iOS app.

## Timezone dependency confirmed

Hosted PostgreSQL reports 17.6. A read-only conversion of 2026-11-03 14:00 UTC
returns 07:00 in America/Edmonton; the app's pinned IANA 2026f data returns 08:00
(UTC-06). January 15, 2027 shows the same difference. The live route-calendar
helper and QR start path already use the pinned rule, but other server date
consumers still depend on the outdated database timezone data.

The provider's October 30 notice recommends PostgreSQL 17.11.0.003 or later (or
15.19.0.003 for PostgreSQL 15):
https://supabase.com/changelog/tzdata-local-time-vancouver-edmonton-casablanca

Handle the supported database upgrade as protected maintenance with current,
verified recovery evidence and post-upgrade clock, Auth, RLS, trip, assignment,
notification and retention checks. Do not reset the database or replay migrations.
The existing encrypted logical-export workflow covers database and password-free
roles; it explicitly does not establish a tested full restore, Storage object
recovery or provider-secret recovery. Those limitations must remain visible.

## Release gates still open

Keep the existing governance records `not_approved` until their actual evidence
and named approvals are supplied. Remaining gates include signed candidate and
physical-device/airplane-mode/restart acceptance, store privacy/background-location
and reviewer-access material, legal/vendor and privacy evidence, recovery/operations
acceptance, Apple account/native implementation, and Google closed-test eligibility.
Do not treat passing unit tests, a signed bundle, an open PR or a draft listing as
commercial launch approval.
