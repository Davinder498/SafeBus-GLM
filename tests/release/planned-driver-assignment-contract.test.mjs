import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/0092_planned_driver_bus_assignments.sql',
  'utf8',
);
const service = fs.readFileSync('apps/web/src/services/driverAssignmentService.ts', 'utf8');
const dashboard = fs.readFileSync('apps/web/src/pages/DriverDashboardPage.tsx', 'utf8');
const generated = fs.readFileSync('packages/types/src/database.generated.ts', 'utf8');
const surface = JSON.parse(fs.readFileSync('config/authorization-surface.json', 'utf8'));

test('the atomic writer validates the complete planned-assignment boundary', () => {
  assert.match(
    migration,
    /admin_set_driver_bus_assignment\(\s*p_driver_id uuid,\s*p_bus_route_assignment_id uuid,\s*p_effective_from date,\s*p_effective_to date default null,\s*p_existing_assignment_id uuid default null/s,
  );
  assert.match(migration, /current_user_role\(\) <> 'tenant_admin'/);
  assert.match(migration, /bra\.tenant_id = v_tenant_id/);
  assert.match(migration, /b\.status = 'active'/);
  assert.match(migration, /d\.status = 'active'/);
  assert.match(migration, /r\.definition_status = 'ready'/);
  assert.match(migration, /not rtp\.schedule_review_required/);
  assert.match(migration, /Planned dates must be within the selected bus service dates/);
  assert.match(migration, /v_existing\.route_trip_pattern_id = v_service\.route_trip_pattern_id/);
  assert.match(migration, /v_existing\.bus_route_assignment_id = v_service\.id/);
  assert.match(migration, /dt\.status in \('active', 'paused'\)/);
  assert.match(migration, /update public\.driver_route_assignments/);
  assert.match(migration, /insert into public\.driver_route_assignments/);
});

test('planning remains separate from QR-confirmed operational truth', () => {
  assert.doesNotMatch(migration, /insert into public\.driver_trips/i);
  assert.doesNotMatch(migration, /perform public\.start_bus_tracking_from_qr/i);
  assert.match(dashboard, /Current trip differs from the plan/);
  assert.match(dashboard, /assignment\.bus_id === activeTrip\.bus_id/);
  assert.match(
    dashboard,
    /assignment\.route_trip_pattern_id === activeTrip\.route_trip_pattern_id/,
  );
  assert.match(dashboard, /<BusQrStartScanner hasActiveTrip=\{false\}/);
  assert.match(dashboard, /Your planned assignments/);
});

test('planned reads, mutation typing, and authorization registration are committed', () => {
  assert.match(service, /from\('driver_route_assignments'\)/);
  assert.match(service, /fetchOwnPlannedDriverAssignments/);
  assert.match(service, /\.eq\('status', 'active'\)/);
  assert.match(service, /admin_set_driver_bus_assignment/);
  assert.match(generated, /admin_set_driver_bus_assignment: \{/);
  assert.ok(
    surface.authenticated.includes('admin_set_driver_bus_assignment(uuid,uuid,date,date,uuid)'),
  );
  assert.match(
    migration,
    /revoke all on function public\.admin_set_driver_bus_assignment\(uuid, uuid, date, date, uuid\) from public/,
  );
  assert.match(
    migration,
    /revoke all on function public\.admin_set_driver_bus_assignment\(uuid, uuid, date, date, uuid\) from anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.admin_set_driver_bus_assignment\(uuid, uuid, date, date, uuid\) to authenticated/,
  );
});
