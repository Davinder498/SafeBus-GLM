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

## Guardian Home and Buses refinement — approved November 19

Owner approved the final white-header Home and Buses mockups after reviewing
populated student assignments. Home uses one bus summary action, a separate map
button, and child rows opening the selected child's latest recorded pickup/drop-off
status. The existing endpoint is not an all-time history; no historical records
are invented. Delayed/unverified locations cannot open a purported live map.

Home and Buses use pull-to-refresh plus an accessible overflow-menu alternative.
Automatic verification cadence and authorization clearing are unchanged. Buses
shows labeled journey, pickup, drop-off and seat values, separated by child and
journey with dividers. Missing seats say `Seat: Not assigned`; failed stop reads
remain unavailable with retry and never look like missing assignments. Journey
names remain the authority-configured names, with no inferred outbound direction.

Review both themes, narrow widths, two children, multiple journeys, long stops,
missing seats, error/empty/loading and delayed locations. Browser fixtures include
populated stops; actual screenshots must be compared with the approved designs.

## Website-matched mobile colour refinement — approved November 19

Owner approved matching both guardian and driver apps to safebus.kids:
website blue (#1d4ed8) for light-mode actions, existing accessible pale blue
for dark-mode actions, navy text, blue-tinted app bars/selected tabs, and school-bus
gold (#f2b84b) for bus identity. Preserve the text-only wordmark and approved
layouts. Status colours retain their meaning and labels. Public website and
administrator themes are unchanged.

Native map overlays use opaque theme-paired backgrounds and text, including
missing location and unavailable stop messages. Check both messages in light and
dark, including a rendered text/background contrast measurement of at least 4.5:1.
Review guardian Home, Buses, map, Alerts, Account/security/settings and the driver
home/scan/active-trip/Alerts/Account/settings families, plus sign-in and dialogs.
Official guidance consulted: https://developer.android.com/design/ui/mobile/guides/styles/color

Android system bars also follow the native light/dark chrome, using dark system icons
on pale blue and light icons on navy. Device verification remains required.
