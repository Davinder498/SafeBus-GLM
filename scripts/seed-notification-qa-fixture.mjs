#!/usr/bin/env node

// SafeBus Alberta - Phase 15B notification delivery QA fixture
//
// Seeds a fake tenant, guardian, student, driver, route, bus, trip, and outbox rows in hosted DEV
// for manual notification delivery acceptance. This is DEV-only and uses fake @example.test data.

import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

const REQUIRED_CONFIRMATION = 'DEV_ONLY';
const DATABASE_URL_ENV = 'SAFEBUS_QA_SEED_DATABASE_URL';
const CONFIRM_ENV = 'SAFEBUS_QA_SEED_CONFIRM';

const IDS = {
  tenant: '7c100000-0000-0000-0000-000000000002',
  school: '7c110000-0000-0000-0000-000000000002',
  guardianUser: '7c120000-0000-0000-0000-000000000010',
  guardian: '7c140000-0000-0000-0000-000000000001',
  student: '7c150000-0000-0000-0000-000000000003',
  driverUser: '7c120000-0000-0000-0000-000000000002',
  driver: '7c130000-0000-0000-0000-000000000002',
  bus: '7c160000-0000-0000-0000-000000000002',
  route: '7c170000-0000-0000-0000-000000000002',
  pickupStop: '7c180000-0000-0000-0000-000000000003',
  dropoffStop: '7c180000-0000-0000-0000-000000000004',
  assignment: '7c190000-0000-0000-0000-000000000003',
  driverAssignment: '7c210000-0000-0000-0000-000000000002',
  trip: '7c200000-0000-0000-0000-000000000002',
  pickupEvent: '7c220000-0000-0000-0000-000000000001',
  dropoffEvent: '7c220000-0000-0000-0000-000000000002',
  guardianLink: '7c230000-0000-0000-0000-000000000001',
};

function fail(message) {
  console.error(`\nQA seed refused to run: ${message}`);
  process.exitCode = 1;
}

function redactDatabaseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '<invalid database URL>';
  }
}

function shouldUseSsl(rawUrl) {
  if (process.env.SAFEBUS_QA_SEED_SSL === 'disable') return false;
  try {
    const { hostname } = new URL(rawUrl);
    return !['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return true;
  }
}

function validateEnvironment() {
  const databaseUrl = process.env[DATABASE_URL_ENV];
  const confirmation = process.env[CONFIRM_ENV];

  if (!databaseUrl) { fail(`missing ${DATABASE_URL_ENV}.`); return null; }
  if (confirmation !== REQUIRED_CONFIRMATION) { fail(`${CONFIRM_ENV} must be exactly ${REQUIRED_CONFIRMATION}.`); return null; }

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { fail(`${DATABASE_URL_ENV} is not a valid URL.`); return null; }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) { fail(`${DATABASE_URL_ENV} must use postgres:// or postgresql://.`); return null; }

  return databaseUrl;
}

async function cleanupFixture(client) {
  await client.query(
    `
      delete from public.guardian_notification_outbox where tenant_id = $1;
      delete from public.student_trip_events where driver_trip_id = $2;
      delete from public.driver_trips where id = $2;
      delete from public.driver_route_assignments where id = $3;
      delete from public.student_route_assignments where id = $4;
      delete from public.route_stops where id in ($5, $6);
      delete from public.routes where id = $7;
      delete from public.buses where id = $8;
      delete from public.student_guardians where guardian_id = $9;
      delete from public.students where id = $10;
      delete from public.guardians where id = $9;
      delete from public.drivers where id = $11;
      delete from public.profiles where id in ($12, $13) and email like '%@example.test';
      delete from auth.identities where user_id in ($12, $13) and provider = 'email';
      delete from auth.users where id in ($12, $13) and email like '%@example.test';
      delete from public.schools where id = $14;
      delete from public.tenants where id = $1;
    `,
    [
      IDS.tenant, IDS.trip, IDS.driverAssignment, IDS.assignment,
      IDS.pickupStop, IDS.dropoffStop, IDS.route, IDS.bus,
      IDS.guardian, IDS.student, IDS.driver, IDS.guardianUser, IDS.driverUser, IDS.school,
    ],
  );
}

async function seedAuthUser(client, userId, email) {
  await client.query(
    `
      insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ($1, $2, crypt($3, gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now())
      on conflict (id) do update set email = excluded.email, encrypted_password = excluded.encrypted_password, updated_at = now()
    `,
    [userId, email, 'SafeBusQaGuardian15B!'],
  );
  await client.query(
    `
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values ($1, $2, jsonb_build_object('sub', $2::text, 'email', $1, 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now())
      on conflict (provider, provider_id) do update set user_id = excluded.user_id, identity_data = excluded.identity_data, updated_at = now()
    `,
    [email, userId],
  );
}

async function seedFixture(client) {
  await seedAuthUser(client, IDS.guardianUser, 'qa-guardian-15b@example.test');
  await seedAuthUser(client, IDS.driverUser, 'qa-driver-15b@example.test');

  await client.query(
    `
      insert into public.tenants (id, name, type, status, timezone)
      values ($1, 'QA Notification Tenant', 'demo', 'active', 'America/Edmonton');

      insert into public.schools (id, tenant_id, name, province, status)
      values ($2, $1, 'QA Notification School', 'AB', 'active');

      insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
      values
        ($3, $1, $2, 'QA Notification Guardian', 'qa-guardian-15b@example.test', 'guardian', 'active'),
        ($4, $1, $2, 'QA Notification Driver', 'qa-driver-15b@example.test', 'driver', 'active');

      insert into public.guardians (id, tenant_id, profile_id, status)
      values ($5, $1, $3, 'active');

      insert into public.drivers (id, tenant_id, profile_id, employee_number, status)
      values ($6, $1, $4, 'QA-15B', 'active');

      insert into public.buses (id, tenant_id, school_id, bus_number, capacity, status)
      values ($7, $1, $2, 'QA-15B', 48, 'active');

      insert into public.routes (id, tenant_id, school_id, route_name, route_code, route_type, status)
      values ($8, $1, $2, 'QA Notification Route', 'QA-15B', 'morning', 'active');

      insert into public.route_stops (id, tenant_id, route_id, stop_name, stop_order, planned_arrival_time, status)
      values
        ($9, $1, $8, 'QA Pickup', 1, '08:00', 'active'),
        ($10, $1, $8, 'QA Dropoff', 2, '08:30', 'active');

      insert into public.students (id, tenant_id, school_id, first_name, last_name, grade, status)
      values ($11, $1, $2, 'QA', 'Student', 'K', 'active');

      insert into public.student_guardians (id, tenant_id, student_id, guardian_id, status, can_receive_notifications)
      values ($12, $1, $11, $5, 'active', true);

      insert into public.student_route_assignments (id, tenant_id, student_id, route_id, pickup_stop_id, dropoff_stop_id, effective_from, status)
      values ($13, $1, $11, $8, $9, $10, current_date, 'active');

      insert into public.driver_route_assignments (id, tenant_id, driver_id, bus_id, route_id, trip_type, status, effective_from)
      values ($14, $1, $6, $7, $8, 'morning', 'active', current_date);

      insert into public.driver_trips (id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at)
      values ($15, $1, $6, $7, $8, 'morning', 'active', current_date, now() - interval '10 minutes');
    `,
    [
      IDS.tenant, IDS.school, IDS.guardianUser, IDS.driverUser, IDS.guardian,
      IDS.driver, IDS.bus, IDS.route, IDS.pickupStop, IDS.dropoffStop,
      IDS.student, IDS.guardianLink, IDS.assignment, IDS.driverAssignment, IDS.trip,
    ],
  );

  console.log('\nQA notification fixture created.');
  console.log(`Tenant: QA Notification Tenant (${IDS.tenant})`);
  console.log(`Guardian: QA Notification Guardian <qa-guardian-15b@example.test>`);
  console.log(`Driver: QA Notification Driver <qa-driver-15b@example.test>`);
  console.log(`Student: QA Student (${IDS.student})`);
  console.log('Active trip is ready. Record pickup/drop-off events from the driver manifest to create outbox rows.');
  console.log('Use the dispatcher to deliver, then inspect guardian_notification_outbox for lifecycle state.');
}

async function main() {
  const databaseUrl = validateEnvironment();
  if (!databaseUrl) return;

  console.warn('\nWARNING: This command creates fake SafeBus QA notification data.');
  console.warn('Run it only against hosted Supabase DEV or a disposable migrated database.');
  console.warn('Never run it against production.');
  console.warn(`Database: ${redactDatabaseUrl(databaseUrl)}`);

  const client = new Client({
    connectionString: databaseUrl,
    application_name: 'safebus-notification-qa-fixture',
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    await client.query('begin');
    await cleanupFixture(client);
    await seedFixture(client);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    console.error('\nQA notification seed failed.');
    console.error(error?.message ?? error);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

await main();