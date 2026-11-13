# Android navigation, appearance and readability

## User-visible acceptance

- Guardians have Home, Buses, Alerts and Account. Drivers have Trip, Riders,
  History and Account. Trip is the existing assigned-bus journey, not a new workflow.
- Account groups appearance, notification preferences, password/sign-in security,
  driver profile where applicable, support and privacy. Existing authorization,
  optional participant MFA and mandatory administrator MFA stay enforced.
- A fresh Android install follows the phone's light/dark preference. Existing
  explicit Light/Dark choices survive upgrades; users can choose System again.
- Android font-size changes propagate to WebView text. Navigation labels wrap,
  and content reserves the measured navigation height. Wide windows use a rail.
- Back dismisses an open overlay before navigating. Busy native HTML dialogs can
  veto cancellation. Internal pages go back, or to the role's home when opened
  directly. At home/sign-in Android owns Back, allowing its normal home behavior.
- Web dashboards retain their existing navigation and appearance controls for
  guardians, drivers, school authority admins, school-scoped admins,
  transportation admins and platform admins. No access or business rules change.

## Guidance used

- [Core app quality](https://developer.android.com/docs/quality-guidelines/core-app-quality)
- [Accessibility foundations](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility)
- [Predictive Back](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)
- [Dark theme](https://developer.android.com/develop/ui/views/theming/darktheme)
- [Adaptive apps](https://developer.android.com/develop/ui/views/layout/build-adaptive-apps)

## Verification and release boundaries

Automated coverage includes role-specific navigation, account/MFA access,
System/Light/Dark persistence, overlay-first Back handling, 320px layout with
200% CSS text-size stress, wide-window rail resizing, and WCAG scans. CSS stress
is not proof of Android's actual font rendering. The existing full browser CI
suite is required for this UI change; it has not been disabled or narrowed.

The local workspace cannot launch a test browser (socket operation denied), and
its Playwright browser download returned an invalid archive. Browser results must
come from CI. Android emulator/physical-device checks remain a release gate:
TalkBack, actual 200% system font size, gesture and three-button navigation,
keyboard dismissal, permission return, rotation and process restoration.
`AppearanceInstrumentedTest` covers theme persistence and native text zoom with
placeholder service configuration; it must run on an emulator before claiming
native verification. Native build/lint alone does not run this instrumented test.

A mobile build and Capacitor sync update source/bundled assets only. They do not
install an APK, publish an AAB, or update users' Play Store installations. Refresh
and visually review Play screenshots from this version before its store rollout;
existing screenshot files are not evidence for the new navigation. Keep the
current API 36 target; this work does not claim Android 17 device certification.

## Local validation result

Type checking, linting, both production builds, the mobile build and Android
sync passed. The full web suite passed 1,232 tests and release checks passed
607 tests. The mobile suite passed 36 tests including Back ownership changes
and avoiding redundant native bridge calls. An initial worker-exit failure was
resolved by rerunning; the Android publication check exposed ordering-sensitive
configuration validation, corrected without removing any required setting.
GitHub CI results, rather than this local record, govern merge eligibility.
