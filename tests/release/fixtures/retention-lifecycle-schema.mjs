import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const migrationPath = 'supabase/migrations/pending/20261105172229_retention_lifecycle.sql';
export async function fixture(install = true) {
  const db = new PGlite();
  await db.exec(`
 create schema auth; create schema safebus_private; create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid,bucket_id text);
 alter table storage.objects enable row level security;
 create function storage.reject_bucket_delete() returns trigger language plpgsql as $$begin raise exception 'Direct bucket deletion is blocked' using errcode='42501'; end$$;
 create trigger protect_buckets_delete before delete on storage.buckets for each statement execute function storage.reject_bucket_delete();
 insert into storage.buckets values ('retention-evidence','retention-evidence',false,2000000,array['application/octet-stream']);
 create role anon; create role authenticated; create role service_role;
 create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('test.role',true),''),'service_role')$$;
 create function auth.uid() returns uuid language sql as $$select coalesce(nullif(current_setting('test.uid',true),''),'11111111-1111-4111-8111-111111111111')::uuid$$;
 create function public.is_current_user_session_active() returns boolean language sql as $$select coalesce(current_setting('test.session',true),'true')<>'false'$$;
 create function safebus_private.enforce_mfa_if_required() returns void language plpgsql as $$begin if current_setting('test.mfa',true)='false' then raise exception 'MFA required' using errcode='42501'; end if; end$$;
 create function safebus_private.enforce_recent_auth_for_sensitive_action() returns void language plpgsql as $$begin if current_setting('test.recent',true)='false' then raise exception 'Recent authentication required' using errcode='42501'; end if; end$$;
 create function safebus_private.write_audit_event_legacy(text,text,uuid,text,text,jsonb,text) returns void language sql as $$select$$;
 create table public.retention_execution_control(id int primary key,destructive_enabled boolean,approval_reference text,approved_at timestamptz);
 insert into public.retention_execution_control values(1,false,null,null);
 create table public.tenants(id uuid primary key,status text);
 insert into public.tenants values('22222222-2222-4222-8222-222222222222','active');
 create table public.profiles(id uuid primary key,tenant_id uuid,role text,status text);
 insert into public.profiles values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','tenant_admin','active');
 create table public.driver_trips(id uuid primary key default gen_random_uuid(),tenant_id uuid,started_at timestamptz,ended_at timestamptz,status text,created_at timestamptz default now(),updated_at timestamptz default now());
 create table public.driver_trip_location_updates(id uuid primary key default gen_random_uuid(),tenant_id uuid,driver_trip_id uuid references public.driver_trips(id) on delete cascade,recorded_at timestamptz,created_at timestamptz default now(),latitude double precision,longitude double precision);
 create table public.student_trip_events(id uuid primary key default gen_random_uuid(),driver_trip_id uuid references public.driver_trips(id) on delete cascade,created_at timestamptz default now(),event_time timestamptz);
 create table public.trip_exceptions(id uuid primary key default gen_random_uuid(),driver_trip_id uuid references public.driver_trips(id) on delete cascade,created_at timestamptz default now());
 create table public.trip_operational_statuses(id uuid primary key default gen_random_uuid(),driver_trip_id uuid references public.driver_trips(id) on delete cascade,set_at timestamptz,updated_at timestamptz);
 create table safebus_private.authority_announcements(id uuid primary key default gen_random_uuid(),tenant_id uuid,title text,created_at timestamptz default now());
 create table public.user_notifications(id uuid primary key default gen_random_uuid(),created_at timestamptz default now());
 create table public.guardian_notification_outbox(id uuid primary key default gen_random_uuid(),user_notification_id uuid references public.user_notifications(id) on delete cascade,student_trip_event_id uuid references public.student_trip_events(id) on delete cascade,status text,created_at timestamptz default now(),delivered_at timestamptz,failed_at timestamptz,cancelled_at timestamptz,dead_lettered_at timestamptz);
 create table public.push_notification_outbox(id uuid primary key default gen_random_uuid(),notification_id uuid references public.user_notifications(id) on delete cascade,status text,created_at timestamptz default now(),delivered_at timestamptz,failed_at timestamptz,cancelled_at timestamptz);
 create table public.user_notification_settings(profile_id uuid);
 create table public.user_notification_category_preferences(profile_id uuid,category text);
 create table public.guardian_student_push_preferences(student_guardian_id uuid,category text);
 create table public.retention_policies(policy_key text,retention_days integer,expiry_action text,active boolean);
 `);
  await db.exec(
    await fs.readFile('tests/release/fixtures/retention-lifecycle-installed-functions.sql', 'utf8'),
  );
  if (install) await db.exec(await fs.readFile(migrationPath, 'utf8'));
  return db;
}
