# MFA settings cleanup — 2026-10-25

Guardians and drivers manage optional MFA immediately below their notification
settings. The MFA card remains available when notification preferences fail.
The profile menu retains Support and Privacy Notice and no longer links to a
duplicate Account security page. `/account` redirects to the role's Settings
page; `/account/security` retains the existing authenticator management flow.
Enrollment, removal and the management Back action return to Settings.

No authentication, MFA requirement, database, notification choice, or administrator
permission changes are included. Removing an enrolled authenticator still requires
a fresh successful authenticator challenge. Public privacy and account-deletion
routes remain available, with deletion instructions linked from Privacy Notice.
Android publication checks follow these actual access paths, and privacy evidence
now includes both Settings pages and the shared MFA card.

## Verification

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed.
- Focused component/authentication tests passed (20 tests).
- Mobile browser MFA and privacy tests passed (9 tests), including both roles,
  mandatory challenge after enrollment, failed and successful removal, old-account
  redirects, returning to Settings, and notification-service errors. Accessibility
  checks passed on authenticator enrollment and the privacy notice.
- The first broad run encountered resource-contention timeouts while builds and
  browsers ran concurrently. Repeating with `VITEST_MAX_FORKS=2` and
  `VITEST_MIN_FORKS=1` passed all 583 web tests. These are local test-run settings,
  not changes to application behavior or the CI configuration.
- `pnpm test` completed successfully: 583 web tests, two mobile tests, and 364
  release/database-contract tests. The two affected mobile presentation scenarios
  also passed, for 11 successful browser scenarios in total.
- Browser screenshots were inspected locally. The MFA action retains a single
  line on narrow screens.

This is implementation and local verification evidence. No protected release,
human merge approval, device installation, or live verification is claimed.
