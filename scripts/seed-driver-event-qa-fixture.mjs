#!/usr/bin/env node

import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

const REQUIRED_CONFIRMATION = 'DEV_ONLY';
const DATABASE_URL_ENV = 'SAFEBUS_QA_SEED_DATABASE_URL';
const CONFIRM_ENV = 'SAFEBUS_QA_SEED_CONFIRM';
const DRIVER_AUTH_USER_ID_ENV = 'SAFEBUS_QA_DRIVER_AUTH_USER_ID';
const DRIVER_EMAIL_ENV = 'SAFEBUS_QA_DRIVER_EMAIL';
const DEFAULT_DRIVER_EMAIL = 'qa-test-driver@example.test';
const DEFAULT_DRIVER_PASSWORD = 'SafeBusQaDriver7C!';

const IDS = {
  tenant: '7c100000-0000-0000-0000-000000000001',
  school: '7c110000-0000-0000-0000-000000000001',
  driverUser: '7c120000-0000-0000-0000-000000000001',
  driver: '7c130000-0000-0000-0000-000000000001',
  studentOne: '7c150000-0000-0000-0000-000000000001',
  studentTwo: '7c150000-0000-0000-0000-000000000002',
  bus: '7c160000-0000-0000-0000-000000000001',
  route: '7c170000-0000-0000-0000-000000000001',
  pickupStop: '7c180000-0000-0000-0000-000000000001',
  dropoffStop: '7c180000-0000-0000-0000-000000000002',
  assignmentOne: '7c190000-0000-0000-0000-000000000001',
  assignmentTwo: '7c190000-0000-0000-0000-000000000002',
  trip: '7c200000-0000-0000-0000-000000000001',
  driverAssignment: '7c210000-0000-0000-0000-000000000001',
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
  if (process.env.SAFEBUS_QA_SEED_SSL === 'disable') {
    return false;
  }

  try {
    const { hostname } = new URL(rawUrl);
    return !['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return true;
  }
}

function validateUuid(value, name) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be a UUID.`);
  }
}

function validateEnvironment() {
  const databaseUrl = process.env[DATABASE_URL_ENV];
  const confirmation = process.env[CONFIRM_ENV];
  const driverAuthUserId = process.env[DRIVER_AUTH_USER_ID_ENV] ?? IDS.driverUser;
  const driverEmail = process.env[DRIVER_EMAIL_ENV] ?? DEFAULT_DRIVER_EMAIL;

  if (!databaseUrl) {
    fail(`missing ${DATABASE_URL_ENV}.`);
    return null;
  }

  if (confirmation !== REQUIRED_CONFIRMATION) {
    fail(`${CONFIRM_ENV} must be exactly ${REQUIRED_CONFIRMATION}.`);
    return null;
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail(`${DATABASE_URL_ENV} is not a valid URL.`);
    return null;
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    fail(`${DATABASE_URL_ENV} must use postgres:// or postgresql://.`);
    return null;
  }

  try {
    validateUuid(driverAuthUserId, DRIVER_AUTH_USER_ID_ENV);
  } catch (error) {
    fail(error.message);
    return null;
  }

  if (!driverEmail.endsWith('@example.test')) {
    fail(`${DRIVER_EMAIL_ENV} must use the reserved @example.test domain.`);
    return null;
  }

  return { databaseUrl, driverAuthUserId, driverEmail };
}

async function assertExpectedSchema(client) {
  const required = [
    ['public', 'tenants'],
    ['public', 'schools'],
    ['public', 'profiles'],
    ['public', 'drivers'],
    ['public', 'students'],
    ['public', 'buses'],
    ['public', 'routes'],
    ['public', 'route_stops'],
    ['public', 'student_route_assignments'],
    ['public', 'driver_route_assignments'],
    ['public', 'driver_trips'],
    ['public', 'student_trip_events'],
    ['auth', 'users'],
    ['auth', 'identities'],
  ];

  const { rows } = await client.query(
    `
      select table_schema, table_name
      from information_schema.tables
      where (table_schema, table_name) in (
        ${required.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')}
      )
    `,
    required.flat(),
  );
  const found = new Set(rows.map((row) => `${row.table_schema}.${row.table_name}`));
  const missing = required
    .map(([schema, table]) => `${schema}.${table}`)
    .filter((table) => !found.has(table));

  if (missing.length > 0) {
    throw new Error(
      `Database is missing expected SafeBus tables. Apply migrations first. Missing: ${missing.join(
        ', ',
      )}`,
    );
  }
}

async function cleanupFixture(client, driverAuthUserId) {
  await client.query(
    `
      delete from public.student_trip_events where driver_trip_id = $1;
      delete from public.driver_trip_current_locations where driver_trip_id = $1;
      delete from public.driver_trip_location_updates where driver_trip_id = $1;
      delete from public.driver_trips where id = $1;
      delete from public.driver_route_assignments where id = $2;
      delete from public.student_route_assignments where id in ($3, $4);
      delete from public.route_stops where id in ($5, $6);
      delete from public.routes where id = $7;
      delete from public.buses where id = $8;
      delete from public.students where id in ($9, $10);
      delete from public.drivers where id = $11;
      delete from public.profiles where id = $12 and email like '%@example.test';
      delete from auth.identities where user_id = $12 and provider = 'email';
      delete from auth.users where id = $12 and email like '%@example.test';
      delete from public.schools where id = $13;
      delete from public.tenants where id = $14;
    `,
    [
      IDS.trip,
      IDS.driverAssignment,
      IDS.assignmentOne,
      IDS.assignmentTwo,
      IDS.pickupStop,
      IDS.dropoffStop,
      IDS.route,
      IDS.bus,
      IDS.studentOne,
      IDS.studentTwo,
      IDS.driver,
      driverAuthUserId,
      IDS.school,
      IDS.tenant,
    ],
  );
}

async function seedAuthUser(client, driverAuthUserId, driverEmail) {
  await client.query(
    `
      insert into auth.users (
        id,
        email,
        encrypted_password,
        email_confirmed_at,
        role,
        aud,
        instance_id,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      values (
        $1,
        $2,
        crypt($3, gen_salt('bf')),
        now(),
        'authenticated',
        'authenticated',
        '00000000-0000-0000-0000-000000000000',
        '{}'::jsonb,
        '{}'::jsonb,
        now(),
        now()
      )
      on conflict (id) do update
      set
        email = excluded.email,
        encrypted_password = excluded.encrypted_password,
        email_confirmed_at = excluded.email_confirmed_at,
        updated_at = now()
    `,
    [driverAuthUserId, driverEmail, DEFAULT_DRIVER_PASSWORD],
  );

  await client.query(
    `
      insert into auth.identities (
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      )
      values (
        $1,
        $2,
        jsonb_build_object(
          'sub', $2::text,
          'email', $1,
          'email_verified', true,
          'phone_verified', false
        ),
        'email',
        now(),
        now(),
        now()
      )
      on conflict (provider, provider_id) do update
      set
        user_id = excluded.user_id,
        identity_data = excluded.identity_data,
        updated_at = now()
    `,
    [driverEmail, driverAuthUserId],
  );
}

async function seedFixture(client, driverAuthUserId, driverEmail) {
  await client.query(
    `
      insert into public.tenants (id, name, type, status)
      values ($1, 'QA Test Tenant', 'demo', 'active');

      insert into public.schools (id, tenant_id, name, province, status)
      values ($2, $1, 'QA Test School', 'AB', 'active');

      insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
      values ($3, $1, $2, 'QA Test Driver', $4, 'driver', 'active');

      insert into public.drivers (id, tenant_id, profile_id, employee_number, status)
      values ($5, $1, $3, 'QA-DRIVER-7C', 'active');

      insert into public.buses (id, tenant_id, school_id, bus_number, license_plate, capacity, status)
      values ($6, $1, $2, 'QA-BUS-7C', null, 48, 'active');

      insert into public.routes (id, tenant_id, school_id, route_name, route_code, route_type, status)
      values ($7, $1, $2, 'QA Test Route', 'QA-7C', 'morning', 'active');

      insert into public.route_stops (id, tenant_id, route_id, stop_name, stop_order, planned_arrival_time, status)
      values
        ($8, $1, $7, 'QA Pickup Stop', 1, '08:00', 'active'),
        ($9, $1, $7, 'QA Dropoff Stop', 2, '08:30', 'active');

      insert into public.students (id, tenant_id, school_id, first_name, last_name, grade, status)
      values
        ($10, $1, $2, 'QA Test Student', 'One', 'QA', 'active'),
        ($11, $1, $2, 'QA Test Student', 'Two', 'QA', 'active');

      insert into public.student_route_assignments (
        id,
        tenant_id,
        student_id,
        route_id,
        pickup_stop_id,
        dropoff_stop_id,
        effective_from,
        status
      )
      values
        ($12, $1, $10, $7, $8, $9, current_date, 'active'),
        ($13, $1, $11, $7, $8, $9, current_date, 'active');

      insert into public.driver_route_assignments (
        id,
        tenant_id,
        driver_id,
        bus_id,
        route_id,
        trip_type,
        status,
        effective_from
      )
      values ($14, $1, $5, $6, $7, 'morning', 'active', current_date);

      insert into public.driver_trips (
        id,
        tenant_id,
        driver_id,
        bus_id,
        route_id,
        trip_type,
        status,
        service_date,
        started_at
      )
      values ($15, $1, $5, $6, $7, 'morning', 'active', current_date, now() - interval '10 minutes');
    `,
    [
      IDS.tenant,
      IDS.school,
      driverAuthUserId,
      driverEmail,
      IDS.driver,
      IDS.bus,
      IDS.route,
      IDS.pickupStop,
      IDS.dropoffStop,
      IDS.studentOne,
      IDS.studentTwo,
      IDS.assignmentOne,
      IDS.assignmentTwo,
      IDS.driverAssignment,
      IDS.trip,
    ],
  );
}

async function main() {
  const config = validateEnvironment();
  if (!config) return;

  console.warn('\nWARNING: This command creates fake SafeBus QA data.');
  console.warn('Run it only against hosted Supabase DEV or a disposable migrated database.');
  console.warn('Never run it against production.');
  console.warn('It uses a direct Postgres URL, not VITE_SUPABASE_URL or anon keys.');
  console.warn(`Database: ${redactDatabaseUrl(config.databaseUrl)}`);
  console.warn(`Driver email: ${config.driverEmail}`);

  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: 'safebus-driver-event-qa-fixture',
    ssl: shouldUseSsl(config.databaseUrl) ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    await assertExpectedSchema(client);

    await client.query('begin');
    await cleanupFixture(client, config.driverAuthUserId);
    await seedAuthUser(client, config.driverAuthUserId, config.driverEmail);
    await seedFixture(client, config.driverAuthUserId, config.driverEmail);
    await client.query('commit');

    console.log('\nQA driver event fixture created.');
    console.log(`Tenant: QA Test Tenant (${IDS.tenant})`);
    console.log(`Driver: QA Test Driver <${config.driverEmail}>`);
    console.log(`Password: ${DEFAULT_DRIVER_PASSWORD}`);
    console.log('Route: QA Test Route');
    console.log('Students: QA Test Student One, QA Test Student Two');
    console.log('Active trip is ready for /driver/manifest.');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    console.error('\nQA seed failed.');
    console.error(error?.message ?? error);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

await main();
