# Route and Named Trip Acceptance

Use hosted Supabase DEV only. Do not run `0046` until the preflight in that
migration succeeds.

1. Apply `0045_route_trip_pattern_foundation.sql` in the hosted DEV SQL Editor.
   Then apply `0047_route_definition_rls_and_route_stop_fk_repair.sql`. If
   `0045` was already applied, apply only the corrective `0047` script now;
   continue to defer `0046` until its preflight succeeds.
2. Sign in as a tenant admin and create an inactive regular route.
3. Rename the trips to `Up` and `Down`. Add a start, an intermediate stop, and
   an end; place each on the map and enter different times for both trips.
   Confirm Add stop remains disabled until Save stop details is selected for
   the current stop. These stop saves are local to the form; confirm no route
   rows are written until Save route definition is selected.
4. Move the middle stop up and down. Save and reload. Confirm order,
   coordinates, names, times, color, and Start/End labels persist.
5. Activate the route. Confirm activation is blocked if either terminal lacks
   coordinates and succeeds when all stops are complete.
6. Create a route with No school selected. Confirm the atomic save succeeds,
   and verify every `route_stops.route_id` references an existing route.
7. Create a field-trip route with outward and return names. Confirm it uses the
   same two-direction model.
8. Assign one bus to both named trips, then test separate buses by deactivating
   one assignment and adding a different bus. Confirm overlapping service dates
   for the same trip are rejected.
9. Assign a driver to each named trip. Sign in as the driver and confirm the
   dashboard shows the configured names and starts a run from the assignment.
10. On admin live monitoring, confirm the route line and stops remain visible
   beneath the bus marker. Confirm route colors remain stable after reload.
11. Sign in as a guardian linked to a student on the active route. Confirm only
    that student's route geometry is visible. Make the GPS update stale and
    confirm the route remains while the bus marker disappears.
12. Sign in as a school/transportation admin and confirm route edit/create
    controls are absent. Confirm guardian, driver, and anonymous users cannot
    call the route-definition writer.
13. Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:smoke
pnpm test:rls:dev -- tests/rls/route-trip-pattern-rls.sql
```

Before `0046`, query:

```sql
select id, route_code, definition_status
from public.routes
where status = 'active' and definition_status <> 'ready';

select id, route_id, direction
from public.route_trip_patterns
where status = 'active' and schedule_review_required;
```

Both result sets must be empty.
