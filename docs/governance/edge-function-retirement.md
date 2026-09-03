# Supabase Edge Function Boundary

## Status

The legacy tracking prototypes remain retired. The notification milestone now
adds one narrowly scoped `push-notification-dispatcher` Edge Function for review.
It has not been deployed and this change does not inspect or mutate the hosted
production project.

## Retired prototypes

| Function          | Reason for retirement                                                                                                                                    | Current approved path                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ingest-location` | Used a stale trip/table contract and accepted caller-supplied driver, trip, bus, and source identifiers.                                                 | Web uses `update_driver_trip_location`; Android uses the device- and QR-session-bound `ingest_driver_location_event`. Both derive authorization scope server-side. |
| `gps-stale-check` | Used service-role access and mutated legacy trip GPS statuses on a proposed 15-second schedule that was never part of the approved release architecture. | Admin and guardian read RPCs derive fresh, stale, or missing state from authoritative location timestamps without this function.                                   |

The prototype handler source, its unused `@safebus/api` invocation helper, and
the matching obsolete request/response contracts have been removed.

## Fail-closed deployment boundary

Supabase documents that a bare `supabase functions deploy` publishes every
function under `supabase/functions`. It also documents
`functions.<function_name>.enabled = false` as the configuration that skips a
function during deployment and local serving.

`supabase/config.toml` therefore keeps both retired names explicitly disabled.
The release regression suite additionally requires all of the following:

- neither retired handler exists under `supabase/functions`;
- neither retired client invocation contract is exported;
- both retired names remain disabled in configuration;
- web and native Android tracking still target the reviewed Postgres RPCs.

## Notification dispatcher boundary

`push-notification-dispatcher` is not a client API. It accepts POST only and
requires a dedicated high-entropy secret using a timing-safe comparison. Its
Firebase service-account JSON and dispatcher secret live only in protected
Supabase Edge Function Secrets. Supabase's server context supplies the
privileged database client, so the handler never reads or parses the underlying
secret key. That client is used only for the reviewed queue RPCs from migration
`0092_end_to_end_notification_system.sql`.

The function sends privacy-safe notification-plus-data payloads through FCM
HTTP v1. It does not render student names, routes, stops, coordinates, driver
identity, arbitrary source text, FCM tokens, or internal queue identifiers into
logs or lock-screen content. Queue eligibility is rechecked immediately before
delivery, and invalid tokens, provider throttling, bounded retry, and delivery
health incidents retain the reviewed database behavior.

Migration `0094_schedule_push_notification_dispatcher.sql` creates a one-minute
`pg_cron`/`pg_net` invocation. The SQL contains no credential: it reads the
project URL and dispatcher secret from two named Vault entries and performs no
request while either entry is absent or invalid. Tenant push remains separately
fail-closed behind privacy approval and `push_notifications_enabled=false`.

Deployment is isolated in the protected `Deploy push dispatcher` workflow. It
requires a full reviewed SHA already merged to `main`, a human confirmation and
the GitHub `production` environment. It deploys only the named function, never
uses `--prune`, and does not configure or print provider credentials.

## Reintroduction gate

A future additional Supabase Edge Function requires its own approved milestone.
That review must define the need, authentication and authorization model,
least-privilege database access, secrets, rate limits, logging/privacy controls,
deployment and rollback procedure, and isolated end-to-end validation. It must
also replace the relevant disabled configuration deliberately; restoring a
directory alone is not sufficient.
