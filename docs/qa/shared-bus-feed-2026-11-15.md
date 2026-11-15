# Shared bus feed: compatible rollout

Status: prepared locally; not installed or published. This is the first protocol
transition, not 5,000–10,000-bus capacity qualification.

## Behavior and boundaries

Parent live-map and bus-detail screens obtain an optional opaque topic from the
existing `get_guardian_bus_service_lines(text)` JSON response. No trip UUID, bus
UUID, student information or coordinates are added to broadcasts. The topic is a
SHA-256 digest of the random trip UUID and protocol namespace. It is a routing
identifier, not a credential: knowing it cannot grant access.

The receive policy checks current session, optional MFA, guardian/profile/tenant
status, active student link/expiry, current Edmonton service dates, bus/route/
pattern assignment and active or paused trip with an active driver. Other
families and school authorities cannot join. Administrators retain their existing
tenant feed and secured reads; platform admins and drivers gain no guardian-feed
access. No client publishing or presence permission is introduced.

Realtime permissions are cached at join/token refresh. Therefore an already
joined connection might receive another **coordinate-free hint** after revocation;
every subsequent data read still uses the authoritative secured RPC. No location
or student data is trusted from a broadcast. Personal authorization/trip/assignment
signals remain subscribed and force checks independently of the location throttle.

Shared subscriptions are deduplicated per client/topic, released hidden/offline,
and replaced on account/service changes. Legacy location hints are ignored only
after every selected shared channel is connected. Disconnects clear stale display
data and immediately revalidate; regular polling continues. Old servers without
the optional field and older Android bundles keep their existing behavior.

Driver GPS ingestion, native foreground service, phone-lock collection, upload
queue, permissions and cadence are unchanged. Build/sync is not a physical-device
test or an Android store release.

## Worker and transition cost

The existing bounded worker adds one shared hint at the beginning of each trip
pass alongside the existing administrator hint. It retains legacy guardian paging
and counts the shared hint against the same message budget. Failed sends roll back
that scope's messages/progress; concurrent GPS retains another pass. With a
one-message custom budget the existing administrator hint has priority and no
shared hint is emitted in that pass; secured polling remains fallback. The
production job uses its unchanged 250-message budget, ten trip visits per second
and 25-guardian page size.

**Dual delivery adds work temporarily. It does not remove fan-out yet.** One
25-guardian first page produces 27 messages (25 legacy + admin + shared), with
subsequent pages continuing without another shared hint. Shared delivery still
has one billable delivery per connected recipient. Legacy pagination can still
delay the next trip pass. Do not claim a measured saving or fleet throughput gain.

After compatible website and Android publication plus mixed-version/physical
verification, review a protected cutover removing legacy location fan-out while
retaining personal control signals and fallback polling. Parent home currently
retains its existing bounded personal-feed behavior; account for that consumer
before cutover. Worker sizing and provider quotas require a separate measured
capacity exercise; no live load test or paid upgrade is performed here.

## Complete release package

- Pending migration: `20261115121343_shared_bus_tracking_feed.sql`.
- Operational milestone: `shared_bus_feed`; exact function ACL/body and policy
  manifest plus full catalog delta. No immutable migration is edited.
- Predecessor DB release: `91b9ad3370ef281ba0f511c430fe9b229d7a6ebc`, fingerprint
  `2c248d60044f3fcf8fbcbbdeb68860e044dff4a9eb8b6f9c975b5ff6a0a436d8`.
  Both replaced function catalog rows were compared exactly with hosted read-only
  inspection. The existing RPC signature/return type/public allowlist is unchanged.
- Recovery removes the new receive policy before dropping its helper, restores
  the original RPC/worker, and restores the exact predecessor schema. The release
  ledger guard rejects unrelated drift and later releases. Existing queued work
  and customer data are not deleted.

Release order: green reviewed PR → merge → protected `Release operational fix`
with current main SHA, `shared_bus_feed`, `install`, `INSTALL_OPERATIONAL_FIX` →
successful post-install read-only verification → protected reviewed website
artifact publication. The installer already rehearses with rollback and retains
encrypted recovery; a second rehearsal action is not required. Android requires
its own reviewed build/publication. Existing versions remain compatible throughout.

The production environment requires the owner's approval. Do not bypass that
gate, install directly through the SQL connector, or confuse CI with installation.

## Verification

Embedded PostgreSQL tests execute the migration, actual authenticated receive
policy, role/session/MFA/tenant/expiry/date/service denials, receive-only publishing
denial, old/new message delivery, bounded cursor paging, failure rollback,
concurrent generation retention and exact catalog recovery. These use synthetic
local fixtures, never production customer records.

React tests cover private topic validation, multi-topic readiness, hidden/offline
release, principal changes, late callbacks, StrictMode, legacy/shared deduplication,
personal control priority and fallback polling after disconnection. The browser
fixture exercises the parent map through a local synthetic socket and proves
server-denied reads remove markers. Existing browser cases retain old-server
compatibility coverage. Required repository checks and mobile build/sync must pass
before merge; record actual results in the PR and completion report.

Remaining proof after publication: mixed installed Android versions, physical
locked-phone GPS/network recovery and a controlled, budgeted capacity test with
agreed guardian concurrency and provider quotas. This change alone is not
commercial launch or capacity certification.


Local verification completed: `pnpm typecheck`, `pnpm lint`, `pnpm build`,
`pnpm test` (1,261 web, 36 mobile, 682 release/database tests), immutable migration
verification (125 files), mobile production build and Android sync all passed.
The first concurrent build was terminated by the local resource limit (137);
the isolated rerun passed. Generated launcher artwork was restored to avoid
unrelated asset churn. Browser execution remains for GitHub CI because this
managed local environment cannot launch Chromium; no sandbox control was bypassed.
