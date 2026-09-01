# Google Play Data Safety — Notification Evidence

Status: pending privacy/security and Play Console approval.

- FCM token and installation identity are collected only after contextual opt-in for guardian/driver Android push.
- Tokens are restricted service credentials, never exposed to browser table access, application logs, lock-screen content, or analytics.
- Push payloads are generic by default. Limited previews reveal event type only and never names, routes, stops, coordinates, driver identity, tenant identifiers, or internal IDs.
- Tokens are refreshed at enabled app startup, revoked on sign-out/account change/user action, invalidated on definitive FCM rejection, and staled after 90 days without refresh.
- Firebase Cloud Messaging is a required subprocessor and push remains tenant-gated off until approval is recorded.
- Users can disable push, revoke registered devices, or open Android system notification controls. The authenticated in-app inbox remains authoritative.
