# Supabase Edge Function Retirement

## Status

Implemented for review in Commercial Readiness Remediation 5. SafeBus has no
approved Supabase Edge Functions and this milestone does not deploy, delete, or
inspect any function in the hosted production project.

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

## Reintroduction gate

A future Supabase Edge Function requires its own approved milestone. That review
must define the need, authentication and authorization model, least-privilege
database access, secrets, rate limits, logging/privacy controls, deployment and
rollback procedure, and isolated end-to-end validation. It must also replace the
relevant disabled configuration deliberately; restoring a directory alone is
not sufficient.
