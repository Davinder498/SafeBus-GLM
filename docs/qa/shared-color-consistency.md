# Shared web and mobile colors

This milestone applies the approved navy-and-blue direction to existing screens. It changes presentation only: no Supabase changes, saved route colors, map geometry, authorization, notifications, recipient preferences or trip rules.

## Acceptance

| User | Expected behavior |
| --- | --- |
| School authority admin | Blue primary actions, a navy text-only sidebar wordmark, neutral cards and header, readable forms and clearly selected navigation in light/dark mode. Existing authority scope and mandatory MFA stay unchanged. |
| Transportation admin | The same visual roles on permitted screens; no additional editing or authority access. |
| Retired school-admin role | Access remains denied; no new navigation or workflows. |
| Guardian | The same blue action and status meanings on their authorized bus, student, inbox and preference screens. Linked-student scope and recipient choices stay unchanged. |
| Driver | The same palette on their own authorized screens. Tracking freshness, offline/pending states, trip controls and optional MFA enrollment retain their behavior. |
| Platform admin | Shared colors on existing platform settings, forms, menus and dialogs; no new operational access. |

Web public/sign-in pages keep their fixed light appearance. Dashboard and native light/dark choices retain their existing local persistence and cross-tab behavior. Native headers and system bars stay navy; light canvas, splash background and WebView startup colors now agree. Physical installation is still needed to inspect actual Android system bars and splash rendering.

## Color roles

- Existing navy branding stays `#172B3A`. Wordmarks are blue on light surfaces and white on dark surfaces; the sidebar bus badge is removed.
- Primary actions are `#1D4ED8` in light mode and `#9CCBFF` with dark text in dark mode. Yellow is no longer a general action or heading color.
- Light canvas is `#F5F7FA`, cards are white, and dark canvas/cards retain their charcoal palette. Placeholder and control borders use readable semantic values.
- Green means success, amber means attention, red means error/destructive action, blue means information, and gray means neutral. Existing labels and icons continue to communicate meaning without relying on color alone.
- Unread notification counts use the same solid red background and white number on the guardian navigation tab and driver/admin header in both appearances. Counts still disappear when read, and the existing `99+` cap and accessible unread labels stay unchanged. No role gains a new destination or notification access.
- Shared utility colors live in `packages/config/theme-colors.js`; semantic component roles live in the web appearance stylesheet imported by mobile. Native layout aliases resolve to those same roles in both modes. Existing saved route/map colors and provider tiles are untouched.
- Shared styles participate in Turbo's global cache inputs so a web palette edit cannot reuse an older mobile build. Legacy filled action links and filters use the same action colors, with navigation chrome excluded.

## Verification

Use the existing appearance, website smoke and native-entry browser suites with intercepted synthetic fixtures and external-traffic blocking. Check role-specific settings, menus, dialogs, forms, unavailable storage, theme persistence, fixed public appearance, print output, map controls, overflow and automated WCAG A/AA checks. The added sign-in cases verify actual primary controls and field outlines in both entry points. These browser checks do not establish hosted permissions, notification delivery or physical-device behavior.

Before release, run typecheck, lint, build and the full test suite; build the mobile bundle and only then sync Android. Native startup color changes require shipping the matching native wrapper as well as its bundle through the normal protected release workflow. No production release is part of this local implementation.

Android sync also refreshes generated project paths to the Capacitor 8.6 dependencies already merged into main. This milestone adds no dependency upgrade. Kotlin's generated cache is ignored alongside Gradle build output.

### Local results, 2026-11-02

| Check | Result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | Passed. |
| `pnpm lint --concurrency=1` | Passed. |
| `pnpm build --concurrency=1` | Passed for web and mobile. |
| `pnpm test --concurrency=1` | 888 web, 15 mobile and 370 release checks passed. |
| Appearance browser suite | Final complete run: 22 passed, 8 intentional platform-specific skips. Includes light/dark sign-in color and automated accessibility checks. |
| Native-entry browser suite | Complete run: 113 passed and 3 failed; after fixing a neutral status dot and updating two obsolete legal-card border expectations, all 3 failed cases passed on rerun (116 cases covered). |
| Website smoke suite | Complete run: 359 passed, 2 failed, 7 skips. Both failures were obsolete brand-icon/action-color expectations; after updating them, both affected files passed in full on both projects (26 checks, all 361 website cases accounted for). |
| Final live-map CTA assertion | Passed on retry. The first attempt timed out while the development route displayed its loading screen; this remains a recorded browser-test flake. |
| Unread badge follow-up | Both existing guardian/driver inbox cases passed with red/white badge assertions in both themes and badge removal after reading. Driver coverage checks the header badge; guardian coverage checks the navigation-tab badge. Typecheck, lint, web/mobile builds, all 1,273 unit/release checks, mobile build followed by Android sync and debug packaging passed again. All 54 current assets match the Android copy. |
| `pnpm --filter @safebus/mobile build` then `pnpm --filter @safebus/mobile cap:sync` | Both passed in order after the final stylesheet changes; Android received the current bundle. |
| Android JVM tests, debug assembly and lint | Passed: 37 JVM tests, `assembleDebug` and `lintDebug`. |
| Final Android package after sync | `assembleDebug` passed again with the final bundle. All 54 built assets match Android's copied bundle. This is a local debug package, not an installation or publication. |

Tests used synthetic local browser fixtures or the existing embedded test harness. No hosted database write, real announcement or external notification was sent. Results do not establish production or physical-device verification. Local command logs and browser screenshots are under ignored `test-results/design-*.log`, `test-results/appearance` and `test-results/mobile-ui`; GitHub CI has not run for this unpushed branch.

## Manual review

1. On desktop, inspect the overview, route workspace, fleet list, roster, reporting, settings and platform dialogs in both appearances. Primary actions should be blue, ordinary headings neutral, and selection/focus visible.
2. On phone width, inspect guardian bus cards and status labels, driver trip actions and offline/pending messages, inbox filters, notification preferences, sign-in, invitation and password forms. Confirm errors and disabled controls remain distinguishable.
3. Confirm a previously saved route color is unchanged in route editing and on the map. Keep map provider imagery and status/freshness disclosures unchanged.
4. Check public pages and sign-in on web remain light even with a saved dark dashboard choice; confirm native preference persistence across app restarts.
5. After installing the reviewed Android build, inspect the navy system bars/header, light and dark launch backgrounds, keyboard/focus visibility and readable controls outdoors. Build/sync alone is not device verification.

Per the owner's instruction, obtain approval before pushing this batch or subsequent fixes. Keep it on its feature branch and use human PR/merge review and protected production release.
