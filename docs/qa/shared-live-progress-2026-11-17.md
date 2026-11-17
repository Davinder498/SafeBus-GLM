# Shared live bus progress and ETA calculations

## Scope and acceptance

The guardian service-line RPC now reuses common progress, stop-state and ETA
calculations for the same current GPS sample and route inputs. Each request still
checks the current session, optional-MFA completion, guardian identity, authority,
student links and effective bus assignments. It adds only that parent's student
names after computing or retrieving shared metrics. The public JSON contract,
current-GPS display rules and ETA wording are unchanged.

| Role                     | Acceptance                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guardian                 | Reuses common calculations only after current access checks; sees only linked student names. Revoked/expired links and removed assignments stop visibility on the next request. |
| Driver                   | Guardian RPC and private helper/cache unavailable; GPS ingestion and notifications retain existing behavior.                                                                    |
| School authority admin   | Guardian RPC unavailable; existing operations unchanged. Route edits change the next reader's input digest.                                                                     |
| School-scoped admin      | Same denial; school/authority scope unchanged.                                                                                                                                  |
| Transportation admin     | Same denial; operational tools and notifications unchanged.                                                                                                                     |
| Platform admin           | Same denial; no new cross-authority API.                                                                                                                                        |
| Anonymous / service role | No direct private cache, calculation-helper or invalidation-helper execution. Existing service-role RPC grant retains its existing guardian/session checks.                     |

This does not collapse fifty parent requests into one request. Authorization,
current source reads and parent-specific name assembly remain per request. A
notification-only parent does not populate this cache. GPS updates make one
indexed cache deletion attempt regardless of the number of viewers; notification
source generation, recipient choices, delivery and retries are unchanged.

## Lifecycle and concurrency

- A private, RLS-enabled table holds at most one derived result per current trip
  location. There are no client grants or policies. The calculation helper is
  SECURITY INVOKER and owner-only, called through the guarded public RPC.
- Stored values are stop IDs, progress position/source, stop count, service states
  and ETA status/minutes. No raw GPS coordinates, timestamps, student names,
  guardian identities or authorization decisions are stored.
- The digest includes the current service/GPS inputs, freshness state, ordered
  stops/schedules and complete shape. GPS, speed, accuracy, trip, shape, direction
  and schedule changes cannot reuse a mismatched result.
- GPS changes and relevant trip updates delete the result transactionally. Trip
  completion therefore removes it even while the original live point still
  exists. Deleting/expiring the current location cascades to its derived cache;
  this uses the existing transient-position cleanup rather than adding a worker
  or extending the source's retention period.
- Every caller recomputes GPS validity/freshness. A stale, invalid, future or
  missing sample cannot reuse a fresh result, even if an older cached row remains
  until source cleanup. Historical GPS samples are not accumulated.
- A cold computation tries a per-trip advisory lock. Contending readers compute
  their own response without filling the cache. Warm hits do not rewrite rows.
  This deliberately permits duplicate cold computations during bursts; it is not
  a guarantee of exactly one computation under every concurrent arrival.
- After the expensive calculation, a cache fill briefly takes NOWAIT share locks
  on the trip and current-location rows and compares all relevant source values.
  Changed/busy sources skip the fill. The locks prevent late fills from restoring
  data already invalidated by GPS or trip updates; locks remain until the RPC
  transaction ends and can briefly delay a writer. This contention cost still
  needs representative multi-connection measurement.
- Read-only transactions compute exact responses without cache writes or source
  locks. The pre-existing static geometry cache remains available beneath the
  common calculation.

## Evidence and limits

Eight embedded PostgreSQL tests use real PostGIS and synthetic records only:

- Full JSON equality with the previously shipped RPC across directions, geometry
  and fallback, midnight schedules, off-route/missing/stale/future GPS,
  paused/completed trips and inactive/missing stops.
- Fifty sequential reads alternating two authenticated guardians produce one
  live-cache fill and retain separate student names. Stored keys are checked to
  exclude names, raw coordinates and GPS timestamps.
- Source mutations and deletion clear derived state. Link expiry and assignment
  removal stop access. Session/MFA, all other roles and tenant mismatches deny.
- Route edits replace one bounded result. Late input simulations cannot refill
  after GPS change or trip completion. A retained earlier result is not served
  once the caller classifies its sample as stale.
- Private privileges, enabled invalidation triggers, exact catalog lineage,
  PostgreSQL 17 NOT NULL representation and complete rollback are verified.
  Recovery preserves source GPS and the preceding static geometry cache.

These are correctness and sequential reuse tests, not a multi-connection race
exercise, provider-delivery test or fleet capacity qualification. The next
capacity work must cover realistic map/summary/notification-only mixtures,
500/5,000/10,000 buses, reconnect bursts, ingest latency, cache contention,
notification backlogs, connection limits and recovery.

The existing legacy worker remains for older installed Android clients. Android
publication and physical-device testing remain separate from build/sync and this
backward-compatible server change.

## Protected rollout

Pending migration: `20261117064801_shared_live_bus_progress.sql`.
Release operational fix option: `shared_live_progress`.
Preceding installed release: `36a576580821fd6f8ba471f5ccd34ab468ac5469`.
Preceding schema fingerprint:
`c20c7a394caf2b267c4a586d5415046e8a6ff3f2419c018d2747226d3c7ddea7`.

The protected workflow rehearses, restores, retains encrypted recovery, installs
following environment approval and performs read-only verification. No new
production fixtures, load tests or provider notifications are authorized by this
migration. Merge is not installation or commercial launch approval.

The read-only hosted advisory scan retains existing warnings concerning guarded
SECURITY DEFINER API endpoints and disabled leaked-password protection. The
[preceding review](shared-route-geometry-2026-11-16.md) records their remediation
references; this change does not claim a clean platform-wide advisory report.

### Installed evidence — 2026-11-17

PR #464 merged as `a40008fbc6c24ee16f35bb316bda3287aad67f55`.
[Protected release 44044730031](https://github.com/Davinder498/SafeBus-GLM/actions/runs/44044730031)
passed rehearsal, recovery retention, installation and verification. Independent
read-only verification confirmed the cache, both enabled invalidation triggers,
RPC/helper definitions and fingerprint
`502e5769df192afe246c8c5d793839efd66052311a9555e5f7c904fc01d82857`.
This is installation evidence, not fleet load qualification.
