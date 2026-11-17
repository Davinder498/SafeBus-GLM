# Shared route geometry for guardian service lines

## Scope and acceptance

This milestone reuses static stop projections, route-segment distances and scheduled
segment durations across guardian requests. It does **not** turn fifty parent
requests into one request. Current access checks, GPS projection, ETA assembly and
parent-specific student names still run per request. Notification-only parents
remain served by the existing notification pipeline, independently of map viewers.

| Role                     | Required behavior                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guardian                 | Current session, optional-MFA completion, active identity, tenant, current student link and effective assignment checked on every RPC; only own linked student names returned. |
| Driver                   | Cannot call the guardian RPC or private cache/helper; tracking ingestion unchanged.                                                                                            |
| School authority admin   | Cannot call the guardian RPC or private cache/helper; route edits change the next read's static input digest.                                                                  |
| School-scoped admin      | Same denial; no expansion of school or authority scope.                                                                                                                        |
| Transportation admin     | Same denial; operations and notifications unchanged.                                                                                                                           |
| Platform admin           | Same denial; no cross-authority cache API.                                                                                                                                     |
| Anonymous / service role | No direct cache or helper access. Existing guardian RPC grant to service_role remains, with its existing guardian/session checks.                                              |

## Implementation

- Private RLS-enabled cache, no client policies or grants. Private helper is
  SECURITY INVOKER, callable only by its owner through the existing guarded RPC.
- One cache row per route trip pattern. The digest includes tenant, route, pattern,
  ordered stop IDs, coordinates, planned arrival times and the complete shape.
  Editing, reordering, removing stops, switching directions/shapes or changing
  schedules cannot reuse a mismatched result.
- Cache stores only stop IDs, shape fractions, distances and scheduled durations.
  It stores no coordinates, GPS history, names, guardian identity or permission.
  Pattern, route and authority deletion cascade to the cache.
- Warm reads do not rewrite the cache. A cold read tries a transaction advisory
  lock; a competing fill falls back to its own computation instead of waiting
  for the cache lock. Read-only transactions also compute without writing.
- The public RPC becomes VOLATILE because cache misses can write derived data.
  Existing web and Android clients use POST RPC calls. Its response shape is
  unchanged. GPS freshness and access are never cached.
- This adds no worker, notification send, subscription channel or new public API.
  The legacy worker remains for older installed Android clients; retirement and
  Android publication/physical testing are separate rollout steps.

## Verification

The new tests run actual PostGIS inside embedded PostgreSQL with synthetic data,
never against hosted production. PostGIS is a pinned test-only dependency.

- Exact full JSON equality with the previous shipped RPC across forward/reverse,
  shape and stop-sequence fallback, midnight schedules, off-route/missing/stale/
  future GPS, paused/completed trips, missing coordinates and inactive stops.
- Fifty sequential requests alternating two guardians reuse one cache fill and
  retain each parent's own student names. This is a correctness test, not a load
  qualification or evidence of fifty simultaneous viewers.
- GPS changes remain current without changing the static cache. Revoking a link
  or removing an assignment immediately removes visibility on the next request.
- Session/MFA failures, wrong roles, cross-tenant identity and direct cache/helper
  access fail closed. Static-input changes replace the single cache row.
- Exact catalog delta, production PostgreSQL 17 NOT NULL representation, reviewed
  function checksums, private privileges and restoration of the previous RPC are
  tested. Source route data survives rollback.

## Protected production release

Pending migration: `20261117053238_shared_route_geometry.sql`.
Release Operational Fix option: `shared_route_geometry`.

The preceding installed database release is
`920f56275562e1e8fcd66c77067368573ac748a1`, with fingerprint
`b874cd35a49fbef4602a6a63d06de7ead5d10da95d22ca6b70a0ed5026168017`.
The installed guardian RPC definition was read-only verified as
`641546ed5ea6a520424b9ea720806802` before implementation.

The protected workflow must rehearse and restore the change, retain encrypted
recovery evidence, install after environment approval, then run read-only catalog
and privilege verification. A merged PR alone does not mean this migration is live.
No production load tests or real notifications are part of this rollout.

Still required for commercial scale: measurements of the remaining personalized
queries and dynamic GPS calculations; representative 500/5,000/10,000-bus testing
including mixed map, summary and notification-only use, reconnect bursts, queues,
connection limits, provider delivery and recovery. No fleet capacity is certified
by this change.

Hosted advisory inspection was read-only. Existing warnings for intentionally
exposed, guarded SECURITY DEFINER RPCs and disabled leaked-password protection
remain separate launch-review items; this is not a clean platform-wide security
attestation. References: [function execution review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
