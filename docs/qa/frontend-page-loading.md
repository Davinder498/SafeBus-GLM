# Frontend page loading

This milestone reduces startup JavaScript and recovers from failed page downloads.
It does not establish backend capacity, signed-device acceptance or launch approval.

The web router defers 40 page modules; the mobile router defers 23. Existing role,
session, MFA and surface guards remain outside the page components. Unauthorized
deep links therefore deny access before requesting their protected page code.
Auth, notification and driver tracking providers remain above the page boundary.

Slow downloads show a status message. Failed imports show an explicit reload
button; reload obtains a fresh page document and retries the import without an
automatic reload loop. Navigation to another path resets the error boundary.
This also catches page rendering errors, without showing exception details.

## Production preview measurements

Measured on 2026-10-11 against baseline `ff3580b3` and this branch's production
builds. Three fresh Chromium contexts per surface opened `/login`. The script
blocks all external requests and requests 150 ms network latency, 1 Mbps download
throughput and 4x CPU slowdown. Preview interception and local machine load limit
the timing interpretation; these are not rural field measurements or latency SLAs.

| Surface              | Initial JS before, decoded | Initial JS after, decoded | Gzip equivalent before | Gzip equivalent after | Gzip reduction |
| -------------------- | -------------------------: | ------------------------: | ---------------------: | --------------------: | -------------: |
| Website              |                1,256,382 B |                 552,822 B |              344,605 B |             160,334 B |          53.5% |
| Mobile browser entry |                  911,950 B |                 559,526 B |              255,324 B |             163,118 B |          36.1% |

Sizes include every script requested before sign-in became visible, including
shared dependencies and the page module. All three samples per build had identical
script totals. Gzip equivalents are calculated from response bodies; they do not
claim the local preview actually transferred gzip-encoded bytes.

Observed median time to a visible sign-in card was 4,984 to 2,565 ms on the website
and 3,624 to 2,731 ms on the mobile entry. Physical Android packages already contain
the assets; the mobile browser results do not prove Android launch or offline
behavior. Core/native chunks still produce size warnings; route splitting does
not remove every startup dependency or reduce the total installed application.

To reproduce, build with placeholder Supabase variables, run a local Vite production
preview, then run `node scripts/measure-route-loading.mjs http://localhost:4191`
(website) or use the mobile preview's port. Never use a hosted URL for this script.

## Regression checks

- Required `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`: pass;
  335 web, 2 mobile and 229 release/contract tests.
- Production browser checks cover both entries: sign-in dependencies and a
  190,000-byte gzip-equivalent JS budget; unauthorized deep links; delayed page
  loading; failed import followed by explicit reload; navigation after failure.
- Existing admin bus workspace: 20 browser cases pass across two viewports.
- Existing mobile UI suite: all 32 browser cases pass, including local video QR
  decoding, native permission mocks and guardian verification failure handling.
- Migration checksums: 125 immutable files pass. No migration files changed.
- CI builds with placeholder configuration and runs `pnpm test:route-loading`.
  The production suite is excluded from the development-server smoke config.

An existing release-workflow contract assertion now normalizes CRLF when reading
YAML, so a fresh Windows checkout exercises the same protection assertions as CI.
No workflow protection, recovery receipt or database release guard is relaxed.

Full backup restoration and migrations 0122–0124 remain deferred and unverified
for persistent installation. They must be completed before commercial launch;
see [commercial-security-remediation.md](commercial-security-remediation.md).
