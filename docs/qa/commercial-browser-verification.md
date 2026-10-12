# Commercial browser verification

The commercial gate had eight skipped scenario declarations after driver and
guardian operations moved out of the website. Those declarations could not prove
the documented journeys. The gate now tests each role in its current app surface.

## Coverage

Website checks run at desktop and phone Chromium viewports. They exercise admin
transportation/trip review, public/admin accessibility, profile and map failure
states, unauthenticated denial, and driver/guardian surface rejection with local
session removal before admin operations are fetched.

The mobile entry point runs at 390 x 844. It exercises:

- camera-based bus QR start, disabled start before inspection confirmation,
  the exact synthetic start/inspection requests, and one confirmed trip-end
  request before returning to the scanner;
- linked-student home/detail presentation and denial of an arbitrary bus URL;
- guardian/driver cross-role denial before operational requests and administrator
  surface rejection with local session removal;
- generic guardian failure with no student cards, followed by successful recovery;
- generic session-registration failure with no driver actions;
- removal of previously verified student/route information after a failed bus
  refresh, followed by denial when the bus is no longer available; and
- automated WCAG A/AA checks on driver scan/active-trip and guardian home/detail.

The API fixtures, sessions, location and video stream are synthetic. Barcode
detection is mocked; this does not prove optical decoding or camera hardware.
The trip-start journey does not use the development-only manual QA token field.
Unhandled external HTTP and websocket connections are blocked. Service workers
are disabled so they cannot bypass interception. A browser check verifies both
unhandled connection paths are blocked.

## Commands and evidence

`pnpm test:product-verification` runs the website gate followed by commercial
mobile checks and guardian refresh-denial coverage. `pnpm test:accessibility`
also runs scans in both entry points. CI's full website and mobile suites include
these files. A release contract rejects skip, fixme and focused-only markers in
the critical commercial journey files.

The targeted run on 2026-10-11 passed 17 website and 12 mobile checks. The local
shell guard returned 60 successful responses at concurrency 10, with local p95
99 ms. The duplicate phone load invocation is intentionally skipped. This is a
localhost HTTP shell check, not database capacity, rural performance or an SLA.

The first exploratory mobile run passed nine checks but timed out creating the
browser page for the trip-start case before that test body ran. The complete gate
then passed, including the camera start/end workflow. Assertions and timeouts
were not weakened to pass it.

Full regression completed on 2026-10-11–12 (America/Edmonton): 263 website checks
passed with 13 legacy/duplicate skips, and all 43 mobile checks passed. Unrelated
legacy skipped tests remain outside this milestone and do not count as evidence.
Required `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test` passed;
unchanged app tasks reused the validated Turbo cache. The unit/contract suite
contains 335 web, 2 mobile and 230 release cases. All 125 immutable migration
checksums passed. Formatting and whitespace checks passed.
Browser discovery now matches only `*.spec.ts`; Node `*.test.mjs` release
contracts remain in `pnpm test` instead of executing as side effects of browser
discovery. The browser case catalog remains 276 cases in 26 files.

## Launch evidence still required

These browser checks do not prove hosted Auth, SQL/RLS, tenant isolation, real
session revocation, Realtime disconnects, signed Android hardware behavior or
the target fleet/user capacity. Backup restore verification and installation of
migrations 0122–0124 remain deferred; the security and commercial launch gates
remain open.
