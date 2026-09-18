# Guardian verification milestone — 2026-09-18

Baseline: `75633465a2f73cd7288bd8ec4e1af8dc5da2e984` on `main`.
Working branch: `codex/guardian-readiness`.

## Agreed delivery constraints

- Preserve the approved commercial release scope: Alberta public school authorities,
  web and Android, 1–3 initial customers and no more than 100 buses.
- Prioritize guardian visibility; readiness determines launch timing.
- The customer reports synthetic data only. The existing hosted database remains
  production-designated. No additional environment is authorized.
- Feature branches and reviewed pull requests; no automatic merge or production release.

## Verified defects and changes

The old map loader could retain a successful location indefinitely while a later
request hung. Its in-flight work was not scoped to the signed-in guardian or
cancelled during cleanup. Background tabs retained data until another successful
refresh. Several guardian pages duplicated weaker loading logic, and the native
bus detail page deliberately retained old student and route data after refresh
failure.

All five guardian views now share one verification lifecycle. It:

- Bounds a request to 10 seconds and aborts the underlying Supabase requests.
- Releases the UI even if a transport ignores cancellation; late results are ignored.
- Scopes results to guardian identity and requested bus, with cleanup on scope change.
- Coalesces overlapping refresh requests and polls every 15 seconds while visible.
- Clears data on offline, hidden-page, or realtime-disconnection events and verifies
  again on return. It never promotes a server-rejected location to a fresh location.
- Preserves generic error messages and the existing authorized RPC contracts.

The service APIs accept an optional `AbortSignal`. No database interface, grant,
schema, or production configuration was changed. Assignments and pickup/drop-off
pages now refresh automatically, adding bounded polling to those views. Capacity
impact still requires measurement before release.

## Verification evidence

Baseline typecheck, lint, build, and test suite passed. New regression cases exposed
failures in the old lifecycle before implementation. Eight lifecycle tests now
cover timeout/recovery, late responses, identity changes, background visibility,
disconnects, signed-out access, StrictMode cleanup, coalescing, unmount cancellation,
and offline recovery.

Final local validation:

| Check                                                                        | Result                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm typecheck`                                                             | Passed across 5 packages                                         |
| `pnpm lint`                                                                  | Passed across 2 packages                                         |
| `pnpm build` with placeholder Supabase configuration                         | Web and mobile bundles passed                                    |
| `pnpm test`                                                                  | 174 web tests, 2 mobile tests, 123 release/contract tests passed |
| Existing guardian map, routes, live-status, and trip-event Playwright suites | 92 desktop/mobile scenarios passed                               |
| Corrected recovery tests plus commercial resilience/accessibility suites     | 22 desktop/mobile scenarios passed                               |
| `pnpm exec playwright test --config playwright.mobile-ui.config.ts`          | All 9 native-surface browser scenarios passed                    |
| `pnpm migrations:verify`                                                     | All 98 immutable migration files verified                        |
| `pnpm security:audit`                                                        | No known production-dependency vulnerabilities reported          |

The first browser run also contained four failures in newly written tests: a
native-only route was incorrectly tested through the web entrypoint, and the fake
clock was installed after polling timers existed. Those harness errors were fixed;
the corrected tests passed in the later browser runs. There were 123 distinct
passing browser scenarios across the final relevant runs. This was targeted
browser coverage, not a run of every repository browser test.

Builds retain the baseline large-bundle warning (web entry approximately 1.23 MB
uncompressed). Bundle splitting and real-device/network performance measurement
remain follow-up work. Native-surface browser tests are not Android hardware or
background-location tests. GitHub CI status is reported separately on the PR.

The browser tests use synthetic intercepted responses. They verify UI behavior,
not server authorization or database RLS. No real student records were queried.

## Remaining release gates, in priority order

1. **Hosted authorization reconciliation.** Read-only Supabase security advisors
   report anonymous execution on privileged functions and mutable function search
   paths. These require function-by-function review against the committed allowlist,
   followed by tested reconciliation. An advisor warning alone does not prove every
   listed function is unsafe. See [anonymous privileged functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
   and [function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
2. **Release adoption evidence.** Catalog inspection found neither
   `safebus_release.migration_checksums` nor `safebus_release.releases` on the hosted
   project. The repository's migration-file verification passes, but that does not
   establish the applied schema or satisfy the protected release workflow.
3. **Database behavior tests.** Execute cross-tenant, guardian-link expiry/revocation,
   inactive-user, driver-scope, migration replay, and recovery cases on an authorized
   isolated target. This remains blocked by the current environment constraint.
4. **Remaining commercial gates.** Verify Android background tracking on devices,
   measured pilot capacity, backup restoration, alert delivery, privacy/vendor
   approvals, and customer acceptance as specified by the existing release scope.
   This milestone does not certify those gates.

The hosted review was catalog-only and used the security advisor. It made no schema,
data, authentication-setting, or deployment changes. Detailed infrastructure findings
are retained locally rather than adding live-target details to this public repository.

## Review and release

The pull request is a code-review artifact. Include `[skip netlify]` in its title and
commit message to suppress automatic preview and branch deployment while environment
isolation remains unresolved, following [Netlify deploy-skipping guidance](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#skip-a-deploy).
GitHub CI remains enabled. Merge and deployment require the existing human-reviewed
release process. A code revert rolls back this change; there is no migration to undo.
