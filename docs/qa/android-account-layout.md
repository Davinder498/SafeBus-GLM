# Android Account page

Owner approved the guardian and driver mockup on 2026-11-18.

Scope: one Account home, grouped account/settings/help rows, identity, sign out,
and appearance dialog. Remove the competing native profile dropdown. Web admin
and recipient menus retain their existing behavior. Driver profile content remains
available at its old URL; the new account identity replaces its navigation entry.
No data, permission, notification-delivery, or authentication policy changes.
Other page redesigns require their own mockups and owner approval.

Guidance consulted before design and implementation:
https://developer.android.com/design/ui/mobile/guides/patterns/settings
https://developer.android.com/guide/navigation/principles

Acceptance: both roles see one support/privacy entry, correct role settings link,
identity and sign out. Appearance follows the phone by default; existing choices
remain intact. Dialog supports focus restoration, Escape and native Back. Failed
sign out remains retryable and must not navigate to login. Narrow screens, large
text and dark mode must remain usable. All administrative roles keep the web UI.

Verification limits: automated browser fixtures are not physical Android testing.
A complete visual walkthrough of all other app pages remains outstanding; this
change does not certify the app's overall UX or launch readiness.

Local verification: type checking and lint passed. Web/mobile production build
passed. Web tests: 1264 passed; mobile tests: 36 passed. Release tests are tracked
separately. Browser journey tests could not launch: the downloadable Chromium
was unavailable, and the installed browser was blocked by workspace socket
permissions. Do not count this as a browser or device pass; visual comparison
and full-app consistency review are still required before merge/publication.
