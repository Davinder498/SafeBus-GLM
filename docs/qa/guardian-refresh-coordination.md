# Guardian live refresh coordination

Status: repository implementation for human review. Customer authorized this
frontend milestone on 2026-10-12. No database migration, hosted load, deployment
or commercial capacity certification is included.

## Before and after

The guardian map mounts two data hooks: bus visibility and the selected bus's
service line. Each previously registered and subscribed to the same private
topic independently. The installed Supabase client reuses a channel by topic,
so separate hook ownership could lose status callbacks or remove a channel still
needed by another consumer. A fixed 15-second polling interval also fetched
again shortly after a successful live refresh.

`trackingInvalidations.ts` now gives each client/topic one subscription owner,
one 150-millisecond burst timer and separate callbacks for its consumers. It
shares coordinate-free invalidations and connection state only; it does not
cache/share RPC results, credentials, coordinates or authorization decisions.
The last consumer releases the channel. Replacement subscription generations
wait for preceding teardown, including rapid navigation and development
StrictMode remounts. Local channel teardown also runs after removal errors.

Normal three-second location signals still cause prompt authoritative refreshes.
All reasons, including authorization and trip-state changes, follow the same
150-millisecond coalescing path; untrusted payload fields cannot supply display
data or suppress a permission recheck. A lost joined connection clears every
consumer immediately, including a loss before the UI's stability timer finishes.
Hidden/offline pages do not dispatch refresh signals. Their data hooks clear
previously verified data and reverify when visible/online again.

`useVerifiedGuardianData` now schedules a single fallback check 15 seconds after
verification completes. Starting a live or manual request cancels that timer.
Live changes during a request retain at most one follow-up; periodic checks
cannot queue a redundant follow-up. Errors/timeouts clear the displayable data
and permit later verification. User/scope changes and cleanup still abort/ignore
old responses. Each dataset continues to use its existing secured RPC.

This does not replace live updates with 15-second-only updates or change the
three-second native/web GPS collector. An initial successful channel join still
requests verification to reconcile the subscription gap; development StrictMode
can therefore cause startup teardown/rejoin, but only one live topic is owned at
a time. No cross-route authorization cache or stale/offline coordinate fallback
is introduced.

## Verification and limits

```powershell
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm exec playwright test --config playwright.mobile-ui.config.ts
pnpm exec playwright test tests/smoke/admin-live-trip-monitoring.spec.ts
```

Unit tests cover shared ownership/private configuration, callback updates,
topic/client/principal isolation, StrictMode, unsubscribe/replacement races,
connection loss, hidden/offline behavior, normal three-second updates, rolling
poll fallback, active-request follow-up and fail-closed authorization errors.

The new browser tests use the actual Supabase client against an owned synthetic
Phoenix/WebSocket endpoint and synthetic REST responses. No socket is forwarded
to Supabase; unexpected external traffic is blocked. They verify a single active
guardian topic, both map RPCs refreshing for each three-second change signal,
updated timestamps visible in the bus popup, absence of an extra fixed-interval
poll, fallback after signals stop, denied-access removal and trip-end removal.
The existing failure-recovery/browser/privacy checks remain required. The new
journeys are included in the explicit product-verification command and no-skip
guard.

These results verify client coordination, not hosted Auth/RLS, provider delivery,
physical Android behavior or end-to-end three-second visibility. The server
still performs per-guardian broadcast work from its GPS transaction; database
fan-out, message quotas, query/storage growth and full-fleet capacity remain
separate work. A continuously active map can still make approximately two
secured calls per accepted location signal. This milestone makes no claim to
support 100,000 concurrent users.

The capacity model retains conservative workload scenarios. Its polling demand
is useful as a fallback/poll-only case; the earlier sum of polling plus every
live invalidation is a conservative legacy upper bound rather than this
coordinator's steady healthy behavior. Do not turn these estimates into measured
capacity or reduce infrastructure budgets without a representative hosted run.

Security migrations and backup restore verification remain deferred launch gates.

## Local validation record — 2026-10-12

- `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test` passed: 360 web,
  2 mobile and 245 release/contract tests (607 total). All 33 affected coordinator
  and hook cases also passed after final review.
- The full mobile run passed 51 of 52 cases. The new popup timestamp check was
  blocked by overlapping synthetic bus/stop icons; only its fixture position was
  corrected. The final affected run passed all four cases (three new plus the
  existing verification-recovery check). The full 52-case suite remains in CI.
- Administrator tracking passed all 18 desktop/phone cases. Its external network
  boundary is explicit; the added setup is the only change to those scenarios.
- Migration checksums passed for 125 immutable files. Formatting of new/refactored
  files and whitespace checks passed. No database or native collector was changed.
