import { PGlite } from '@electric-sql/pglite';
export const ids = {
  owner: '11111111-1111-4111-8111-111111111111',
  tenant: '22222222-2222-4222-8222-222222222222',
  driver: '33333333-3333-4333-8333-333333333333',
  trip: '44444444-4444-4444-8444-444444444444',
};
export async function queuedTripFixture() {
  const db = new PGlite();
  await db.exec(`
    create schema auth; create schema safebus_private;
    create role anon; create role authenticated; create role service_role;
    create function auth.uid() returns uuid language sql as $$select current_setting('test.uid')::uuid$$;
    create function safebus_private.current_tenant_id() returns uuid language sql as $$select current_setting('test.tenant')::uuid$$;
    create function safebus_private.current_driver_id() returns uuid language sql as $$select current_setting('test.driver')::uuid$$;
    create function safebus_private.current_user_role() returns text language sql as $$select current_setting('test.role')$$;
    create function public.is_current_user_session_active() returns boolean language sql as $$select current_setting('test.session')::boolean$$;
    create function safebus_private.has_completed_optional_mfa() returns boolean language sql as $$select current_setting('test.mfa')::boolean$$;
    create table public.tenants(id uuid primary key,status text);
    create table public.profiles(id uuid primary key,tenant_id uuid,role text,status text);
    create table public.drivers(id uuid primary key,tenant_id uuid,profile_id uuid,status text);
    create table public.driver_trips(id uuid primary key,tenant_id uuid,driver_id uuid,status text,updated_at timestamptz);
    create table public.fixture_events(action text);
    create function public.pause_driver_trip(uuid) returns void language plpgsql as $$begin
      update public.driver_trips set status='paused',updated_at=now() where id=$1;
      insert into public.fixture_events values('pause'); end$$;
    create function public.end_driver_trip(uuid) returns void language plpgsql as $$begin
      update public.driver_trips set status='completed',updated_at=now() where id=$1;
      insert into public.fixture_events values('end'); end$$;
    create function public.cancel_driver_trip(uuid,text) returns void language plpgsql as $$begin
      if $2 like '%student name%' then raise exception 'prohibited detail' using errcode='42501'; end if;
      update public.driver_trips set status='cancelled',updated_at=now() where id=$1;
      insert into public.fixture_events values('cancel'); end$$;
    insert into public.tenants values('${ids.tenant}','active');
    insert into public.profiles values('${ids.owner}','${ids.tenant}','driver','active');
    insert into public.drivers values('${ids.driver}','${ids.tenant}','${ids.owner}','active');
    insert into public.driver_trips values('${ids.trip}','${ids.tenant}','${ids.driver}','active','2026-11-03T14:00:00Z');
    select set_config('test.uid','${ids.owner}',false),set_config('test.tenant','${ids.tenant}',false),
      set_config('test.driver','${ids.driver}',false),set_config('test.role','driver',false),
      set_config('test.session','true',false),set_config('test.mfa','true',false);
  `);
  return db;
}
