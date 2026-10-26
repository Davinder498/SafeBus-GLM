# Light/Dark toggle and school-bus lettering

This revision supersedes the System/Light/Dark control documented in
`dark-mode-2026-10-26.md`.

- Appearance has two choices: Light and Dark, with Light as the default. Previous
  explicit choices remain saved; the removed System choice falls back to Light.
  Device changes do not override the selected appearance.
- An accessible switch appears in the platform and school authority website
  headers and the guardian and driver app headers, plus existing appearance
  settings. Public pages and sign-in have no appearance control.
- The hero's “School transportation visibility” badge is removed.
- The platform-only subscription reconciliation action now appears in the
  subscription summary as “Refresh billing status”, only for an actual,
  non-exempt subscription. It reads Stripe's canonical subscription and refreshes
  SafeBus's projection; it cannot purchase, cancel, or change the contract. No
  billing service or authorization behavior changed.
- Bus destination panels have “SCHOOL BUS” lettering in the hero, fleet,
  management, tracking, and ETA photographs. Rear panels are used for rear views.
  Side views, cropped panels, and map symbols do not receive floating labels.
  The editable launcher SVG also includes the lettering, and its Android density
  variants and Play icon are regenerated. The SafeBus screen wordmark remains
  text only.

## Image edits

Used the built-in imagegen tool for the photographic edits. Project assets are
saved in `apps/web/src/assets/` as:

- `hero-winter-morning.webp`
- `why-choose-us-parked-buses.webp`
- `feature-management.webp`
- `feature-tracking.webp`
- `feature-eta.webp`

The hero prompt:

> Edit this existing website hero photograph. Add exactly "SCHOOL BUS" in clear
> black uppercase traditional school-bus lettering, centered on the yellow
> destination panel above the front windshield between the signal lights. Match
> the bus perspective, sunlight, surface texture and panel proportions. Change
> only this missing lettering; preserve the winter landscape, bus, framing,
> aspect ratio, composition and all other details. Keep the same high resolution.
> No additional text or objects.

The prompt used individually for each remaining photo:

> Use case: text-localization. Edit this existing website photograph only. Add
> the exact text "SCHOOL BUS" in traditional black uppercase school bus lettering
> to every visible blank yellow destination panel above a school bus windshield,
> between the warning signal lights. For the rear-view bus, add it to the upper
> rear destination panel above the rear windows instead. Match the perspective,
> scale, lighting, depth of field and texture of each bus. Preserve all people,
> landscape, bus shapes, composition, aspect ratio and all other details. Do not
> add text where the panel is hidden or outside the frame. No extra text or
> objects. Preserve resolution.

Generated images were inspected and encoded as WebP at their original asset
dimensions. Launcher lettering was edited in the existing native SVG source,
`apps/mobile/assets/brand/safebus-official-mark.svg`.

## Verification

- `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed.
- `pnpm test`: passed (629 web tests, 2 mobile tests, 365 release contracts).
- Appearance Playwright suite: 17 passed, 7 intentional role/surface skips. Covers
  both modes, keyboard switching, device-setting independence, reload persistence,
  cross-tab updates, blocked storage, WCAG AA checks, settings, and public controls
  being absent. Screenshots were inspected for the toggle and revised hero.
- Android `testDebugUnitTest assembleDebug :app:assembleDebugAndroidTest lintDebug`:
  passed. The instrumentation APK is compiled; it was not run on a device in this
  revision.

Browser checks use placeholder service configuration, synthetic sessions, and
intercepted requests. Android instrumentation sources verify the appearance
bridge and persistence independently of login. No live billing refresh,
production data writes, production deployment, or store publication is part of
this change. Physical Android device verification remains a separate release
check.
