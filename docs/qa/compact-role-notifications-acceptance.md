# Compact notifications acceptance and release

Drivers remain assignment-only. New tenant and school/transportation administrator
notifications are exceptions-only: cancellation, late/missing service, traffic,
weather, road closure, mechanical problems, and delivery-health incidents. Existing
history is retained; trip monitoring/history remains the source for routine trip
starts and completions.

Guardian notifications name the bus, route, trip/driver when applicable, preferred
or first student name for pickup/drop-off, and tenant-local event date/time. Trip
fan-out matches the bus, route pattern/direction, and effective service date.

Guardian settings contain independent In-app, Email, and Phone push sections with
three event groups each. Defaults for the new in-app settings are on; existing
email/push consent is retained. Disabling a master preserves group selections.
Visibility is captured on insertion, so old history remains visible and events
suppressed during an off period do not appear after re-enabling. External delivery
continues according to its own consent/policy. An authorized external-alert link
can open its detail without adding that notification to the inbox or badge.

## Automated checks

- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`.
- `pnpm migrations:verify` verifies the forward migration and immutable history.
- `pnpm exec playwright test tests/smoke/compact-notifications.spec.ts` exercises
  desktop and phone-width tenant layouts, descriptive messages, detail links, and
  archiving with entirely mocked Supabase traffic.
- `pnpm exec playwright test --config playwright.mobile-ui.config.ts tests/mobile-ui/material-mobile-ui.spec.ts --grep 'notification|guardian updates|driver updates|driver settings'`
  covers switch targets, independent autosaving, failure recovery, and compact
  guardian/driver cards. All traffic is mocked; no production fixtures are used.
- Component/service tests cover queued rapid saves, rollback, master/category
  independence, details absent from the current inbox, and driver query scope.
- Toast regression tests prevent archiving from announcing older entries and
  discard refresh responses from a previous authenticated recipient.
- Release contracts check server-side scope, authorization consistency, history
  preservation, external delivery independence, and context/fallback copy.

## Protected release dependency

Migration `0120_compact_role_notifications.sql` is prepared, not applied. Release
the database change before the frontend that calls the v3 preference and detail
RPCs. Older v2 clients remain supported and cannot overwrite in-app selections.
Pending RPC declarations in the TypeScript database contract are documented;
regenerate the full contract from the hosted schema after approved application.

No isolated database is approved. Offline SQL/PL/pgSQL parsing and source-contract
checks do not prove trigger execution, delivery fan-out, or RLS behavior on the
hosted database. Do not mark database behavior verified from mocked UI tests.

After the protected adoption/release approval and migration application, review
and run `tests/rls/compact-notifications-readonly.sql` and the existing driver
read-only check. They use read-only transactions, local timeouts, and rollback;
the new check samples at most two active profiles per supported tenant role and
uses transaction-local authenticated roles/claims. It never invokes preference
getters that initialize defaults, notification mutations, or delivery workers.
Historical or newly generated events can be inspected read-only for correct
recipient/copy without creating fixtures or sending QA notifications.

Visual acceptance: 24px desktop/16px mobile header-to-filter separation, 8px card
gaps, 12px vertical/16px horizontal card padding, wrapped messages, and 48px switch
targets with keyboard focus. The phone push permission recovery remains available.

Rollback the frontend independently if needed; v2 remains usable. Do not reverse
the additive migration or erase visibility/history decisions. Restore database
behavior only through a separately reviewed forward migration.
