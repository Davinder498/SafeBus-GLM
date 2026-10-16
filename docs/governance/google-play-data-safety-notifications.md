# Google Play Data Safety — Android declaration inventory

**Status:** Draft; pending privacy, security, counsel, processor, and Play Console approval.

This inventory is an engineering input, not a completed Play declaration. Reconcile each item against the final signed AAB, production configuration, approved contracts, and current Play Console questions.

## Data handled by the Android app

| Data category                              | Use                                               | Conditions                                                                                |
| ------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Account identity and user ID               | Authentication, authorization, support, security  | Invited adults only; public signup disabled before publication                            |
| Driver precise and background location     | Maintain authorized active-bus visibility         | Driver role only; active trip only; prominent disclosure and runtime permissions required |
| Trip and transportation activity           | Operate and display assigned bus service          | Role and tenant scoped; guardians see only linked-student bus information                 |
| App interactions and security/audit events | Reliability, abuse prevention, and audit          | Minimize identifiers and retention                                                        |
| Android installation/device identifiers    | Push registration, device revocation, reliability | Collected only after push opt-in where applicable                                         |
| Crash or diagnostic data                   | Only if an approved processor is enabled          | No monitoring processor may be enabled before review and redaction controls               |

The app does not use data for advertising, advertising profiles, sale, or in-app purchases. Students do not use the app. The app must not collect Alberta Student Numbers, student home addresses, student health data, contacts, photos, microphone content, or information from other apps.

## Processing and sharing review

- Supabase provides authentication, database, realtime, and approved server-side functions.
- Netlify delivers the web application and approved functions.
- Geoapify receives map tile coordinates, IP address, origin/referrer, and ordinary request metadata; SafeBus account identifiers are not added to tile requests.
- Firebase Cloud Messaging receives the Android registration token, generic or event-type-only alert content, device IP, and ordinary delivery metadata after opt-in.
- The final declaration must identify every approved email, monitoring, or support processor actually enabled in production. Do not declare a planned processor as active or omit an enabled processor.

## Notification evidence

- FCM token and installation identity are collected only after contextual opt-in for guardian/driver Android push.
- Tokens are restricted service credentials, never exposed to browser table access, application logs, lock-screen content, or analytics.
- Push payloads are generic by default. Limited previews reveal event type only and never names, routes, stops, coordinates, driver identity, tenant identifiers, or internal IDs.
- Tokens are refreshed at enabled app startup, revoked on sign-out/account change/user action, invalidated on definitive FCM rejection, and staled after 90 days without refresh.
- Firebase Cloud Messaging is a required subprocessor and push remains tenant-gated off until approval is recorded.
- Users can disable push, revoke registered devices, or open Android system notification controls. The authenticated in-app inbox remains authoritative.

## Review requirements

- Confirm whether each collected data type is required or optional and whether users can request deletion.
- Confirm encryption in transit and the approved account-deletion process.
- Confirm 30-day raw bus-location and 90-day notification/token retention claims against approved enforcement evidence.
- Confirm processing and backup locations; do not state Canadian residency as fact until evidence is approved.
- Save a non-secret Play Console evidence reference in the privacy and Android readiness records. Never commit reviewer credentials or exported declarations containing personal data.
