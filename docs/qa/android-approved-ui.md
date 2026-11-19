# Approved Android UI update — November 19, 2026

Owner approved the Account boards, eight remaining screen boards, corrected
sign-in error copy, and a combined implementation. This supersedes sequential
page delivery for this change. Generated previews are design references, not
screenshots or new policy text. Preserve all existing role/security/trip rules.

## Acceptance map

- Guardian roots: Home (current status), Buses (assignments/stops), Alerts, Account.
- Driver roots: Trip, Riders, History, Account. Driver Alerts is a child screen.
- Children: one top return arrow, no bottom tabs. In-app entry returns to its
  previous screen; direct entry uses a defined parent. Map returns to the bus
  details page when opened there. Hardware Back closes overlays first.
- Account: security, notification choices, appearance, support, privacy, sign out.
  No separate native Driver Profile destination.
- Security: one password action and one MFA status/action. MFA enrollment and
  authenticated removal retain server verification. Required sign-in MFA cannot
  be bypassed by navigation. Password visibility controls do not change validation.
- Notifications: 48px controls, wrapping filters, readable detail view, separate
  archive action, existing per-role channels and event types. Pending saves and
  errors remain visible; no permission/consent defaults change.
- Guardian data remains limited to linked students and assigned buses. Freshness
  and service-line guards remain. Move assignment/seat/stop information to Buses;
  Home displays recorded status, not a child's live position.
- Driver scanning, permission disclosure, confirmations, and queued stop semantics
  remain intact. An unconfirmed stop is not presented as a completed trip.
- Sign-in/recovery/invitation and legal pages use the native shell. Keep full legal
  text and versioned acceptance; omit technical document hashes from the UI only.
- Shared styles: semantic light/dark colors, 48px controls, wrapping content,
  existing safe-area and tablet navigation behavior; reduced motion respected.

## Scope boundaries

Desktop administrators retain web navigation. This change does not alter database
permissions, trip mutations, GPS delivery, billing, legal terms, or publication.

## Verification

Official guidance reviewed: Android navigation principles, layouts/navigation
patterns, and accessibility guidelines at developer.android.com.

Tests cover direct-entry parents, role roots, MFA security, navigation journeys,
privacy boundaries, loading/errors, and capture approved screens with synthetic
local-only fixtures. CI retains screenshot artifacts on success as well as failure.

Local browser evidence is blocked: Playwright download returned an invalid ZIP;
installed Chromium failed to start with socket permission denied. Do not claim
visual comparison or physical-device verification until actual evidence exists.
Final validation results are recorded in the PR after the final code revision.
