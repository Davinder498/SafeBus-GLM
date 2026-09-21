import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migrationName = fs
  .readdirSync(path.join(root, 'supabase/migrations'))
  .find((name) => name.endsWith('_internal_bus_fleet_numbers.sql'));

assert.ok(migrationName, 'internal fleet-number migration is missing');
const migration = read(`supabase/migrations/${migrationName}`);

test('fleet numbers are separate from the driver-visible buses table', () => {
  assert.match(migration, /create table public\.bus_admin_details/i);
  assert.doesNotMatch(migration, /alter table public\.buses\s+add column\s+fleet_number/i);
  assert.match(
    migration,
    /foreign key \(bus_id, tenant_id\)[\s\S]*references public\.buses \(id, tenant_id\)/i,
  );
  assert.match(migration, /bus_admin_details_tenant_fleet_number_unique/i);
  assert.match(migration, /lower\(fleet_number\)/i);
  assert.match(migration, /length\(fleet_number\) between 1 and 40/i);
});

test('fleet metadata is read-only to scoped tenant administrators', () => {
  const policy = migration.slice(
    migration.indexOf('create policy "bus admin details select scoped administrators"'),
    migration.indexOf('revoke all on table public.bus_admin_details'),
  );

  assert.match(migration, /alter table public\.bus_admin_details enable row level security/i);
  assert.match(policy, /'tenant_admin', 'transportation_admin', 'school_admin'/i);
  assert.match(policy, /caller\.tenant_id = bus_admin_details\.tenant_id/i);
  assert.match(policy, /bus\.school_id = caller\.school_id/i);
  assert.doesNotMatch(policy, /driver|guardian|platform_super_admin/i);
  assert.match(
    migration,
    /revoke all on table public\.bus_admin_details from public, anon, authenticated/i,
  );
  assert.match(migration, /grant select on table public\.bus_admin_details to authenticated/i);
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete).*bus_admin_details.*authenticated/i,
  );
});

test('bus mutations are atomic RPCs that derive tenant context', () => {
  assert.match(migration, /revoke insert, update on table public\.buses from authenticated/i);
  for (const functionName of ['admin_create_bus', 'admin_update_bus']) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`, 'i'));
  }
  assert.match(migration, /where id = auth\.uid\(\) and status = 'active'/gi);
  assert.match(migration, /v_caller\.tenant_id/i);
  assert.doesNotMatch(migration, /admin_create_bus\([\s\S]{0,200}p_tenant_id/i);
  assert.doesNotMatch(migration, /admin_update_bus\([\s\S]{0,200}p_tenant_id/i);
  assert.match(migration, /'bus\.created'/i);
  assert.match(migration, /'bus\.details_updated'/i);
  for (const action of ['bus.created', 'bus.details_updated']) {
    const auditCall = migration.slice(
      migration.indexOf(`'${action}'`),
      migration.indexOf(');', migration.indexOf(`'${action}'`)) + 2,
    );
    assert.match(auditCall, /jsonb_build_object\('changed_fields'/i);
    assert.doesNotMatch(auditCall, /'fleet_number'\s*,\s*v_fleet_number/i);
  }
});

test('admin projections and onboarding include fleet number without changing shared Bus', () => {
  const transportationTypes = read('apps/web/src/types/transportation.ts');
  const sharedBus = transportationTypes.slice(
    transportationTypes.indexOf('export interface Bus {'),
    transportationTypes.indexOf('export interface AdminBus'),
  );
  const adminBus = transportationTypes.slice(
    transportationTypes.indexOf('export interface AdminBus'),
    transportationTypes.indexOf('export interface Driver'),
  );
  const onboardingForm = read('apps/web/src/components/admin/StudentOnboardingForm.tsx');
  const busForm = read('apps/web/src/components/admin/TransportationAdminForms.tsx');

  assert.doesNotMatch(sharedBus, /fleet_number/);
  assert.match(adminBus, /fleet_number: string \| null/);
  assert.match(migration, /create or replace function public\.get_admin_buses_page/i);
  assert.match(migration, /create or replace function public\.get_admin_bus_workspace/i);
  assert.match(migration, /returns table \([\s\S]*fleet_number text/i);
  assert.match(migration, /transportation,bus,fleetNumber/i);
  assert.match(onboardingForm, /Fleet number \(internal\)/i);
  assert.match(busForm, /not shown to families or drivers/i);
});
