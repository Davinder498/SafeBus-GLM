// Embedded PostgreSQL only. No hosted connections, identities or provider sends.
import fs from 'node:fs/promises';
import { serviceDateDb, id } from './service-dates-db.mjs';
export { id };
export const queueBaseline = async () =>
  JSON.parse(
    await fs.readFile(new URL('./tracking-queue-hosted-20261103.json', import.meta.url), 'utf8'),
  );
export const queueSecurityBaseline = async () =>
  JSON.parse(
    await fs.readFile(
      new URL('./tracking-queue-security-hosted-20261103.json', import.meta.url),
      'utf8',
    ),
  );
export const queueMigration = () =>
  fs
    .readFile(
      new URL(
        '../../../supabase/migrations/pending/20261103225142_tracking_queue_session_recovery.sql',
        import.meta.url,
      ),
      'utf8',
    )
    .then((s) => s.replaceAll('\r', ''));
export async function trackingQueueDb() {
  const db = await serviceDateDb();
  try {
    await db.exec(`
      create table driver_tracking_devices(id uuid primary key default gen_random_uuid(),tenant_id uuid,driver_id uuid,profile_id uuid,installation_id uuid unique,credential_hash text unique,status text default 'active',platform text,ownership text,device_model text,app_version text,privacy_notice_version text,privacy_notice_acknowledged_at timestamptz,registered_at timestamptz default now(),revoked_at timestamptz,last_seen_at timestamptz);
      alter table bus_tracking_sessions add primary key(id),add column device_id uuid,add column started_at timestamptz default now(),add column expires_at timestamptz default now()+interval '18 hours',add column last_seen_at timestamptz;
      alter table bus_run_dispatches add column completed_at timestamptz,add column driver_trip_id uuid;
      create table driver_trip_location_updates(id uuid primary key default gen_random_uuid(),tenant_id uuid,driver_trip_id uuid,driver_id uuid,bus_id uuid,route_id uuid,latitude double precision,longitude double precision,accuracy_m double precision,heading_deg double precision,speed_mps double precision,source text,recorded_at timestamptz,tracking_event_id uuid unique,tracking_device_id uuid,device_sequence bigint,battery_percent integer,connectivity text,unique(tracking_device_id,device_sequence));
      alter table driver_trip_current_locations add column accuracy_m double precision,add column heading_deg double precision,add column source text,add column updated_at timestamptz;
      create unique index queue_current_trip on driver_trip_current_locations(driver_trip_id);
      create function safebus_private.hash_driver_device_credential(text) returns text language sql immutable as $$select md5($1)$$;
      create function safebus_private.create_driver_device_credential() returns text language sql volatile as $$select 'sbus_device_v1_'||replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')$$;
      create or replace function safebus_private.create_bus_tracking_session_token() returns text language sql volatile as $$select 'sbus_track_v1_'||replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')$$;
      create function safebus_private.route_calendar_today() returns date language sql stable as $$select (now() at time zone 'America/Edmonton')::date$$;
      -- Calendar behavior has its own suite; this fixture's route is operating.
      create function safebus_private.route_operates_on(uuid,uuid,date) returns boolean language sql stable as $$select true$$;
      create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create table auth.mfa_factors(user_id uuid,status text);
      create table public.user_sessions(id uuid,user_id uuid,revoked_at timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('test.session_id',true),'aal',coalesce(current_setting('test.aal',true),'aal1'))$$;
      insert into auth.sessions values('${id(70)}','${id(3)}',now()+interval '18 hours');
      grant select on all tables in schema public to authenticated;
      update bus_route_assignments set effective_from=null,effective_to=null;
      select set_config('test.uid','${id(3)}',false);
      select set_config('test.session_id','${id(70)}',false);
    `);
    for (const f of [
      ...(await queueBaseline()).functions,
      ...(await queueSecurityBaseline()).functions,
    ]) {
      await db.exec(f.definition.replaceAll('\r', ''));
      const signature = /^(public|safebus_private)\./.test(f.signature)
        ? f.signature
        : 'public.' + f.signature;
      await db.exec(
        `revoke all on function ${signature} from public,anon,authenticated,service_role;grant execute on function ${signature} to authenticated,service_role`,
      );
    }
    await db.exec('set check_function_bodies=on');
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
export const qr = 'sbus_bus_v1_' + 'a'.repeat(40);
export async function start(db) {
  return (await db.query('select public.start_bus_tracking_from_qr($1,$2) as result', [qr, id(23)]))
    .rows[0].result;
}
export async function register(db, installation = id(50)) {
  return (
    await db.query(
      "select public.register_android_byod_tracking_device($1,'Synthetic phone','1.0.0','driver-location-byod-v1') as result",
      [installation],
    )
  ).rows[0].result;
}
export const bind = (db, token, registration) =>
  db.query('select public.bind_driver_tracking_device($1,$2,$3)', [
    token,
    registration.installationId,
    registration.deviceCredential,
  ]);
export const proof = async (db, token, credential) =>
  (
    await db.query('select public.authorize_driver_tracking_queue($1,$2) as result', [
      token,
      credential,
    ])
  ).rows[0].result;
export async function ingest(
  db,
  token,
  credential,
  sequence,
  recordedAt,
  event = id(100 + sequence),
) {
  return (
    await db.query(
      "select public.ingest_driver_location_event($1,$2,$3,$4,$5,53.5,-113.5,5,null,null,80,'offline') as result",
      [token, credential, event, sequence, recordedAt],
    )
  ).rows[0].result;
}
