-- Embedded PostgreSQL only; extends tracking-worker-baseline.sql.
create schema auth;
create type public.user_role as enum ('guardian','driver','tenant_admin','school_admin','transportation_admin','platform_super_admin');
alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type public.user_role using role::public.user_role;
alter table public.profiles add column school_id uuid;
alter table public.routes add column school_id uuid;
alter table public.drivers add column profile_id uuid;
alter table public.driver_trips add column service_date date default current_date;
alter table public.student_guardians add column can_receive_notifications boolean default true;
alter table public.student_guardians add column notification_preferences_set_at timestamptz default now();
alter table public.student_guardians add column notify_pickup boolean default true;
alter table public.student_guardians add column notify_dropoff boolean default true;
alter table public.guardians add column pickup_dropoff_email_enabled boolean default true;
alter table public.guardians add column email_preferences_set_at timestamptz default now();
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
create table public.user_notifications(
 id uuid primary key default gen_random_uuid(), tenant_id uuid,recipient_profile_id uuid,recipient_role public.user_role,
 event_type text,category text,severity text,source_type text,source_id uuid,student_id uuid,driver_trip_id uuid,school_id uuid,
 deduplication_key text,occurred_at timestamptz,created_at timestamptz default now(),read_at timestamptz,archived_at timestamptz,
 in_app_visible boolean default true,unique(recipient_profile_id,deduplication_key)
);
create table public.user_notification_settings(profile_id uuid primary key,tenant_id uuid,push_enabled boolean default true,email_enabled boolean default true,preview_mode text default 'generic');
create table public.user_notification_category_preferences(profile_id uuid,category text,push_enabled boolean default true,email_enabled boolean default true,primary key(profile_id,category));
create table public.guardian_student_push_preferences(student_guardian_id uuid,category text,push_enabled boolean default true);
create table public.guardian_notification_delivery_policies(
 tenant_id uuid primary key,notifications_enabled boolean default true,privacy_review_status text default 'approved',
 privacy_approved_at timestamptz default now(),push_notifications_enabled boolean default true,
 tenant_daily_limit int default 1000,tenant_per_minute_limit int default 1000,
 push_tenant_daily_limit int default 1000,push_tenant_per_minute_limit int default 1000
);
create table public.android_push_devices(id uuid primary key,tenant_id uuid,profile_id uuid,status text default 'active',permission_state text default 'granted',last_seen_at timestamptz default now(),fcm_token text default 'synthetic-token');
create table public.push_notification_outbox(
 id uuid primary key default gen_random_uuid(),tenant_id uuid,notification_id uuid,device_id uuid,available_after timestamptz default now(),
 status text default 'pending',attempt_count int default 0,created_at timestamptz default now(),updated_at timestamptz default now(),
 delivered_at timestamptz,cancelled_at timestamptz,lease_owner text,lease_expires_at timestamptz,failure_category text,
 unique(notification_id,device_id)
);
create table public.guardian_notification_outbox(
 id uuid primary key default gen_random_uuid(),tenant_id uuid,guardian_id uuid,student_id uuid,student_trip_event_id uuid,
 user_notification_id uuid,recipient_profile_id uuid,notification_type text,status text default 'pending'
);
create table public.student_trip_events(id uuid primary key,tenant_id uuid,student_id uuid,event_type text);
create function safebus_private.next_push_availability(uuid,uuid,text) returns timestamptz language sql as $$select now()$$;
create function safebus_private.driver_can_access_notification(public.user_notifications) returns boolean language sql as $$select false$$;
-- Existing lease worker is independently covered by its dispatcher tests. This
-- adapter verifies the new versioned entry point without claiming real work.
create function public.claim_guardian_notification_email_batch(integer,integer,integer,integer)
returns table(id uuid,tenant_id uuid,guardian_id uuid,student_id uuid,student_trip_event_id uuid,notification_type text,attempt_count integer)
language sql as $$ select null::uuid,null::uuid,null::uuid,null::uuid,null::uuid,'synthetic'::text,$1 where $1 > 0 $$;
