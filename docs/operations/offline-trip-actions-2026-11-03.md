# Durable offline stop actions

Acceptance defined before implementation: a driver's confirmed local stop remains
independent of network/authentication availability. Pause, end and cancellation
intents survive app restart and retry while the same active driver is signed in.
Only minimal action metadata and the existing validated operational reason are
stored; no credentials, coordinates or student records enter this queue.

Replay must target the exact original authority, driver and trip, preserve the
observed trip revision, and never resume GPS. Completed/already-paused actions
must not generate duplicate status events. A new/different trip must never be
stopped by an old intent. Changed or expired intents require review. A driver
can discard an unsent intent with an explicit confirmation; collection stays off.
New QR starts/resume are blocked while an intent is unresolved. Storage failure
must be visible, with local collection still stopped and manual retry available.

Guardians, administrators, platform users and retired/unsupported roles must not
read or replay driver intents. Sign-out/account changes stop replay; existing
server session, MFA, tenant, ownership and recipient-consent checks remain. No
real trip actions or notifications are executed as QA.


The new retry RPC holds the own-trip row lock while checking `updated_at` and
calling the existing action. This prevents a cross-device status change between
revision comparison and mutation. It does not replace existing trip, tracking,
dispatch, audit or notification logic. Already-paused/closed trips produce no
second status mutation. The endpoint is authenticated-driver only, with explicit
service-role/anonymous denial, active account/session checks and enrolled MFA.

Roll out the backend using the protected `offline_actions` operational target
before relying on automatic retry in a released app. Missing/unavailable RPCs
retain the intent and show pending confirmation; there is no unsafe legacy retry
fallback. Physical-device/restart/airplane-mode acceptance remains required.

Installation and independent catalog verification completed on November 4 through
the protected release. See [the installation record](offline-trip-action-installation-2026-11-04.md)
and `config/observed/offline-trip-action-authorization.json` for its bounded recovery
and scope evidence. The catalog-verified endpoint is included in the active
authorization inventory; the full protected authorization audit follows its
review and merge.
