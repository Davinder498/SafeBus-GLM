# Google Play publication runbook

**Status:** Repository package prepared; signed candidate, publication, and production approval remain blocked.

This runbook is for the permanent Android identity `SafeBus Alberta` / `com.safebusalberta.app`. It does not authorize production use, change the production database, or approve legal wording.

## Store listing

| Field              | Required value                                                               |
| ------------------ | ---------------------------------------------------------------------------- |
| App type and price | App, free                                                                    |
| Default language   | English (Canada)                                                             |
| Category           | Maps & Navigation                                                            |
| Countries          | Canada only                                                                  |
| Audience           | Adults 18+; students do not use the app                                      |
| Access             | Restricted to invited guardians and drivers                                  |
| Ads / purchases    | No ads and no in-app purchases                                               |
| External marketing | Disabled for the pilot                                                       |
| Short description  | Live school bus operations and visibility for invited drivers and guardians. |

Long description:

> SafeBus Alberta supports invited school bus drivers and guardians. Drivers can connect an authorized phone to an active bus run, while guardians receive limited visibility of the bus assigned to their linked student. Accounts are issued by participating school authorities. SafeBus tracks the bus, not the child.

Do not describe the product as student tracking, a school-management system, or a PowerSchool replacement. Do not advertise iOS until its separate milestone is approved.

## App content

- App access: provide separate synthetic guardian and driver accounts in the restricted Play reviewer instructions. Store credentials only in Play Console, never in Git, screenshots, logs, or the AAB.
- Account provisioning: public registration is unavailable. Explain that participating school authorities invite adults and that reviewers use the supplied accounts.
- Content rating and audience: adults 18+, no student users, no ads, no purchases.
- Privacy policy: `https://bussafe.netlify.app/privacy`.
- Account deletion: `https://bussafe.netlify.app/account-deletion`.
- Data safety: use the reviewed inventory in [google-play-data-safety-notifications.md](google-play-data-safety-notifications.md). Privacy and security owners must reconcile it with the final binary and vendor agreements before submission.

Reviewer instructions must cover both roles without exposing real students, drivers, routes, stops, locations, customer names, or device identifiers. The reviewer accounts must be scoped to a synthetic tenant and reset or revoked after review.

## Background location declaration

Declare one core feature only:

> During a driver-authorized active bus run, SafeBus continues reporting the bus phone's precise location when the app is backgrounded or the screen is locked. This maintains live bus visibility for authorized operations and linked guardians. Collection stops when the run ends or is cancelled.

The declaration video must be public or reviewer-accessible, 30 seconds or less, and show this sequence:

1. Driver signs into the synthetic account and starts the authorized bus flow.
2. The prominent background-location disclosure appears before the runtime permission prompt.
3. The driver grants precise location, background location, and notifications through the Android system flow.
4. The active foreground-service notification is visible.
5. The app is backgrounded or the screen is locked while the synthetic bus remains active.
6. The driver returns and ends the run; the foreground notification and collection stop.

Use no real names, customer identifiers, routes, coordinates, notifications, or devices in the recording.

## Artifact and track sequence

1. Enrol in Play App Signing with a Google-managed app-signing key. Generate a separate SafeBus upload key and keep encrypted and offline backups.
2. Configure the protected `android-production` GitHub environment with the five missing secrets documented in [mobile-app-setup.md](../mobile-app-setup.md). Require human approval on the environment.
3. Run the Android workflow for an exact reviewed 40-character commit. For the first accepted candidate, enter version code `1` and version name `1.0.0`.
4. Retain the signed AAB and `safebus-android-provenance.json`. Confirm the source digest, AAB SHA-256, signing-certificate SHA-256, package, and version.
5. Upload the workflow AAB to Internal Testing. Do not upload the obsolete August 15 local bundle.
6. Install from Play on the approved device matrix and execute the field and notification acceptance plans.
7. Promote the same version code and AAB to Closed Testing for policy review. Do not rebuild between tracks.
8. Inspect Production access. If Play shows the personal-account gate, maintain at least 12 continuously opted-in testers for 14 days and complete Play's production-access process. Otherwise retain the closed test as SafeBus evidence.
9. Close every crash, security/privacy defect, authorization failure, off-trip collection, lost required event, or policy rejection. Cosmetic and measured non-critical performance findings may be triaged after launch.
10. Populate the non-secret evidence references in `android-readiness.json` and the privacy, map, operations, product-verification, and pilot records in dedicated review pull requests.

## Production rollout

Production remains Canada-only. Promote the exact approved AAB at 10%, observe for 24 hours, then 50%, observe for 48 hours, then 100%. Product and Operations must approve each increase. Halt the rollout for any blocking defect listed above.

Repository automation prepares and verifies an artifact; it does not upload to Play or promote a rollout. Those external actions remain human-approved release steps.
