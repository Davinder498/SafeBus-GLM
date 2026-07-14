# Phase 14B Safe ETA Hosted-DEV Acceptance Guide

Phase 14B validates the existing conservative Safe ETA foundation for pilot readiness. It remains pending until the product owner manually accepts a deployed preview.

## Setup

1. Use branch `phase-14b-safe-eta-validation-hardening` and its Netlify deploy preview.
2. Use hosted Supabase DEV only. Never run this against production.
3. Apply migration `0037_safe_eta_validation_hardening.sql` to hosted DEV through the SQL Editor after confirming migrations through `0036` are already applied.
4. Seed the deterministic fixture:

```bash
SAFEBUS_QA_SEED_CONFIRM=DEV_ONLY \
SAFEBUS_QA_SEED_DATABASE_URL='postgresql://...' \
pnpm qa:seed:safe-eta
```

The fixture creates fake `@example.test` accounts only. Password for all fixture users is `SafeBusPhase14B!`.

| Role | Email |
| --- | --- |
| Transportation admin | `qa-safe-eta-admin@example.test` |
| Driver | `qa-safe-eta-driver@example.test` |
| Linked guardian | `qa-safe-eta-guardian@example.test` |
| Unlinked guardian | `qa-safe-eta-unlinked@example.test` |

Map tiles use the existing preview environment configuration. If map tiles are not configured, complete ETA text acceptance from the status/fleet pages and record the tile limitation.

## Applying deterministic location scenarios

Use the guarded scenario helper after seeding:

```bash
SAFEBUS_QA_SEED_CONFIRM=DEV_ONLY \
SAFEBUS_QA_SEED_DATABASE_URL='postgresql://...' \
pnpm qa:safe-eta:scenario between_stops morning
```

Available scenarios: `no_location`, `before_first_stop`, `between_stops`, `near_relevant_stop`, `passed_stop`, `stale_location`, `future_timestamp`, `missing_speed`, `very_low_speed`, `unusually_high_speed`, `valid_measured_speed`.

Use `morning` or `evening` as the second argument.

## Morning trip workflow

1. Apply `no_location morning`; open the admin fleet page and guardian bus status page. Expect ETA temporarily unavailable.
2. Apply `before_first_stop morning`; refresh both pages. Expect a conservative ETA and relevant stop `QA Stop 2 - student pickup/dropoff`.
3. Apply `between_stops morning`; refresh both pages. Expect ETA to change after movement.
4. Apply `near_relevant_stop morning`; expect `Arriving soon` or a small approximate range.
5. Apply `passed_stop morning`; expect the usable ETA to be removed.

## Evening trip workflow

1. Apply `between_stops evening`; refresh guardian status. Expect the same fixture student's drop-off stop to be the relevant stop.
2. Apply `near_relevant_stop evening`; verify reverse-direction behavior is understandable and conservative.
3. Apply `passed_stop evening`; expect no usable ETA after the stop is apparently passed.

## Unsafe states

For each scenario, refresh guardian and admin views and confirm previous ETA text is not presented as current:

| Scenario | Expected result |
| --- | --- |
| `no_location` | ETA temporarily unavailable; no coordinates shown to guardian. |
| `stale_location` | delayed/stale wording; no usable ETA. |
| `future_timestamp` | ETA unavailable / needs attention. |
| End trip in DEV SQL or reseed | active ETA disappears. |
| Deactivate linked guardian row | linked guardian loses ETA access after refresh. |
| Disable browser network/Realtimes | polling/manual refresh still fetches server RPC state. |

## Privacy checks

| Actor | Expected result |
| --- | --- |
| Linked guardian | Sees only the linked fixture student and safe ETA text. |
| Unlinked guardian | Sees no fixture student ETA. |
| Another tenant account | Sees no fixture trip. |
| Transportation admin | Sees fleet ETA without student or guardian personal information. |
| Platform Super Admin | Does not receive tenant operational fleet ETA visibility. |

## Acceptance record

| Scenario | Expected result | Actual result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Morning no location | ETA unavailable | | | |
| Morning between stops | Approximate ETA appears | | | |
| Morning passed stop | ETA removed | | | |
| Evening between stops | Drop-off stop is relevant | | | |
| Evening passed stop | ETA removed | | | |
| Stale/future location | ETA unavailable | | | |
| Linked guardian privacy | Only linked student visible | | | |
| Unlinked guardian privacy | No ETA rows visible | | | |
| Admin fleet | Tenant-only safe operational ETA | | | |
| Platform admin | No operational ETA access | | | |

Manual product-owner approval is required before merge.
