# Guardian viewer read budget and legacy cutover

## Scope and acceptance

This client milestone removes current guardian screens' dependence on personal
location hints. It does not disable the legacy database worker or share fetched
results between different guardians. Every response still comes from the existing
session- and guardian-authorized RPCs. No coordinates are added to broadcasts.

- Guardian home, routes, live-trip list and trip-events screens: ignore personal
  GPS hints; periodically verify at 30–35 seconds while visible and online.
  Personal control/unknown hints and manual refresh recheck immediately.
- Guardian selected-bus map: use shared GPS hints, cap location reads at one per
  three seconds with one trailing refresh; fallback verification every 15 seconds
  after completion. Service-line/stop reads remain capped at 15 seconds for GPS.
- Guardian bus detail: shared GPS-triggered visibility/service-line reads are
  capped at 15 seconds; control hints remain immediate.
- All guardian screens: hidden/offline state aborts transport and clears data;
  return verifies immediately. Unmount and principal/scope changes discard late
  responses. No offline authorization cache or cross-user response cache.
- Driver, school authority admin, school-scoped admin, transportation admin and
  platform admin: existing collection, monitoring, authorization and MFA behavior
  is unchanged. This milestone changes guardian consumers only.
- Notifications: source events, inbox, push/email delivery, permission, opt-outs,
  quiet hours and retries remain independent of map viewers. No notification
  worker, notification context or personal control-event producer is removed.

## What the read budgets mean

At a continuous three-second GPS cadence, each visible summary screen previously
could refresh on every personal hint. It now polls once per 30–35 seconds, with
additional immediate control/manual checks. For 50 visible summary screens this
reduces GPS-driven bus-visibility reads from about 16.7/s to about 1.4–1.7/s under
that model. Home already had a 30–35-second budget, and still does. These are
configuration calculations, not measurements of real users or hosted throughput.
Only parents actually viewing a screen contribute that screen's reads.

Fifty parents actively viewing maps still make separate authorized reads. The
three-second cap bounds bursts; it does not eliminate that cross-viewer work.
Further reduction requires a server design separating recipient-specific
assignment/authorization from common bus computation, including revocation,
tenant boundaries, cache expiry and recovery. Never share the current personalized
RPC response across parents. Capacity for 5,000–10,000 buses is not established.

## Legacy retirement gates

1. Merge and deploy this client build; publish the corresponding Android bundle.
   A web deployment or mobile build/sync does not update installed Android apps.
2. Verify current and old Android builds: active map, summary-only, app closed,
   locked phone, reconnect and expired/revoked access. Confirm independent
   notifications with zero map viewers using the approved device-testing process.
3. Establish and enforce a minimum supported Android build, or retain the legacy
   worker while older supported clients remain. No minimum version is invented
   here and there is no verified installed-version adoption metric in this change.
4. Review a separate bounded migration to stop legacy **location** pagination,
   preserve personal control/authorization signals, and remove its producer writes.
   Rehearse recovery and retain encrypted evidence through the protected workflow.
5. Observe queue age, GPS-write latency, errors and reconnect behavior; only then
   remove legacy queue/function storage in a subsequent reviewed cleanup.

Do not stop the legacy worker merely because current clients ignore its GPS hints.
Do not remove personal channels: they still carry control and authorization events.
No production load test or synthetic recipient delivery is part of this milestone.

## Evidence

The independent shared workers are installed at database release
`920f56275562e1e8fcd66c77067368573ac748a1`, protected
[run 43989753598](https://github.com/Davinder498/SafeBus-GLM/actions/runs/43989753598).
Post-install read-only observation found 16 active jobs, zero pending/retrying
scopes, and 1,873 successful executions across all 16 workers in a bounded recent
sample. This is low-load operational evidence, not fleet qualification.

Client regression tests cover legacy-hint suppression before shared join and
after disconnect, shared GPS bursts, immediate control/unknown hints, periodic
fallback, visibility/offline cancellation, principal changes and late responses.
Release validation and Android publishing are separate evidence; installed-app
and physical-device acceptance remain pending.

The next server-side step is documented in [shared route geometry](shared-route-geometry-2026-11-16.md). It reuses static calculations while retaining per-request authorization and current GPS. Production installation remains a separate protected release.
