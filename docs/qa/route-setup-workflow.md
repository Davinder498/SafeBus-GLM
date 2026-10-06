# Route setup workspace

Tenant administrators can configure an existing route through **Routes → Set up route**. After adding a route, **Continue route setup** opens the same workspace.

1. **Details and stops:** edit route name/code, outbound/return names, stop order and coordinates, regular operating days and planned stop times. A route has no start/end date. Save these settings before defining its road path.
2. **Road path:** draw or import the actual roads, save a draft, review the map and publish. The published geometry belongs to the route; buses assigned to it use that geometry on new runs. Existing runs retain their path snapshot. The existing backend still uses one shared path for outbound/return; different physical roads require separate routes.
3. **Bus, driver and schedule:** assign an existing active bus to both directions or a selected direction, then save a driver plan for each bus direction. Edit bus dates or choose an existing driver plan to change its driver/dates. End dates are optional; start dates default to today or the bus-service start date. Backend overlap and active-run restrictions remain authoritative.
4. **Students:** search existing students and assign service directions and pickup/drop-off stops. The selector contains only this route's bus services. Edit an existing student's service without creating another student record. Different buses/dates are shown separately.
5. **Review:** inspect saved route readiness, published path, bus services, driver plans/date coverage and student stops. The page does not claim complete coverage simply because one driver plan exists. Unavailable roster data is explicitly unverified and student writes are blocked until it can be loaded.

Each section saves independently. A driver rejection does not undo or repeat a saved bus assignment. A failed operating-days write reports that the route definition was already saved; retrying a newly created route retains its saved identity. No all-or-nothing activation or new database API is introduced.

Validation uses intercepted synthetic browser fixtures. No production fixtures, database migrations or deployment are involved. Physical journey testing still requires a reviewed real road path and a new run after release.

Manual checks after release:

- On desktop and phone width, open setup from Routes and follow every section without visiting Bus/Driver/Student pages.
- For Demo Bus 01's route, publish the actual road path, assign its bus and driver, and review a student's forward/return stops.
- Start a new run and compare service-line progress with GPS around road bends.
- Verify conflict messages for overlapping service/driver dates and active-run edits. Do not perform these checks by modifying unrelated production assignments.
- Check a future driver substitution preserves the current dated plan according to the existing assignment workflow.
