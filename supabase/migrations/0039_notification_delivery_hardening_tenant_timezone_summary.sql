-- SafeBus Alberta - Phase 15B notification delivery hardening
--
-- Forward-only migration that adds:
--   1. A tenant IANA time-zone column with a safe Alberta default.
--   2. A tenant-scoped, server-authorized notification-delivery summary RPC
--      for operational administrators (tenant_admin, school_admin,
--      transportation_admin). Platform Super Admin is deliberately excluded.
--   3. An updated payload-resolution RPC that returns the tenant time zone so
--      the email dispatcher can format the authoritative event timestamp in
--      the tenant's configured IANA zone rather than raw UTC.
--
-- This migration does NOT modify migration 0038. It replaces
-- resolve_guardian_notification_email_payload with a compatible superset that
-- adds tenant_timezone to the return columns.

-- ---------------------------------------------------------------------------
-- 1. Tenant time-zone column
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column if not exists timezone text not null default 'America/Edmonton';

alter table public.tenants
  drop constraint if exists tenants_timezone_check;

alter table public.tenants
  add constraint tenants_timezone_check check (
    timezone is not null and length(trim(timezone)) > 0
  );

comment on column public.tenants.timezone is
  'IANA time-zone identifier (e.g. America/Edmonton) used for server-side '
  'event-time formatting in guardian notifications. Defaults to Alberta time. '
  'Must be validated by the application layer before update.';

-- ---------------------------------------------------------------------------
-- 2. Updated payload-resolution RPC (adds tenant_timezone)
-- ---------------------------------------------------------------------------

drop function if exists public.resolve_guardian_notification_email_payload(uuid);

create or replace function public.resolve_guardian_notification_email_payload(p_outbox_id uuid)
returns table (
  outbox_id uuid,
  tenant_id uuid,
  guardian_id uuid,
  recipient_email text,
  student_first_name text,
  notification_type text,
  event_created_at timestamptz,
  tenant_timezone text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Guardian notification resolution requires service role.' using errcode = '42501';
  end if;

  return query
  select o.id, o.tenant_id, o.guardian_id, nullif(trim(coalesce(g.email, p.email)), ''), coalesce(nullif(trim(s.preferred_name), ''), s.first_name), o.notification_type, e.created_at, coalesce(nullif(trim(t.timezone), ''), 'America/Edmonton')
  from public.guardian_notification_outbox o
  join public.tenants t on t.id = o.tenant_id and t.status = 'active'
  join public.guardians g on g.id = o.guardian_id and g.tenant_id = o.tenant_id and g.status = 'active'
  join public.profiles p on p.id = g.profile_id and p.tenant_id = o.tenant_id and p.role = 'guardian' and p.status = 'active'
  join public.students s on s.id = o.student_id and s.tenant_id = o.tenant_id and s.status = 'active'
  join public.student_guardians sg on sg.tenant_id = o.tenant_id and sg.student_id = o.student_id and sg.guardian_id = o.guardian_id and sg.status = 'active' and sg.can_receive_notifications = true
  join public.student_trip_events e on e.id = o.student_trip_event_id and e.tenant_id = o.tenant_id and e.student_id = o.student_id
  where o.id = p_outbox_id
    and o.status = 'processing'
    and ((o.notification_type = 'student_picked_up' and e.event_type = 'picked_up') or (o.notification_type = 'student_dropped_off' and e.event_type = 'dropped_off'));
end;
$$;

revoke all on function public.resolve_guardian_notification_email_payload(uuid) from public, anon, authenticated;
grant execute on function public.resolve_guardian_notification_email_payload(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Tenant-admin notification-delivery summary RPC
--
-- Returns ONLY aggregate counts and normalized failure categories for the
-- caller's tenant. No recipient emails, guardian names, student names,
-- message bodies, provider message IDs, or outbox UUIDs are returned.
--
-- Allowed roles: tenant_admin, school_admin, transportation_admin.
-- Platform Super Admin is deliberately excluded from tenant operational
-- notification visibility.
-- ---------------------------------------------------------------------------

create or replace function public.get_tenant_notification_delivery_summary(
  p_recent_window_hours integer default 24
)
returns table (
  pending_count bigint,
  processing_count bigint,
  delivered_count_recent bigint,
  failed_count_recent bigint,
  cancelled_count_recent bigint,
  oldest_pending_age_seconds integer,
  recent_failure_categories jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_role text;
  v_window_hours integer;
  v_window_start timestamptz;
begin
  -- Must be authenticated.
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  v_role := public.current_user_role();
  v_tenant_id := public.current_tenant_id();

  -- Only tenant-scoped operational admins may view notification delivery
  -- summaries. Platform Super Admin is excluded.
  if v_role is null or v_role not in ('tenant_admin', 'school_admin', 'transportation_admin') then
    raise exception 'Notification delivery summary requires a tenant operational admin role.' using errcode = '42501';
  end if;

  if v_tenant_id is null then
    raise exception 'Tenant context required.' using errcode = '42501';
  end if;

  -- Bound the recent window to 1-168 hours (1 hour to 7 days).
  v_window_hours := greatest(1, least(coalesce(p_recent_window_hours, 24), 168));
  v_window_start := now() - make_interval(hours => v_window_hours);

  return query
  with agg as (
    select
      count(*) filter (where status = 'pending') as p_pending,
      count(*) filter (where status = 'processing') as p_processing,
      count(*) filter (where status = 'delivered' and delivered_at >= v_window_start) as p_delivered_recent,
      count(*) filter (where status = 'failed' and failed_at >= v_window_start) as p_failed_recent,
      count(*) filter (where status = 'cancelled' and cancelled_at >= v_window_start) as p_cancelled_recent,
      coalesce(extract(epoch from (now() - min(created_at) filter (where status = 'pending')))::integer, 0) as p_oldest_pending
    from public.guardian_notification_outbox
    where tenant_id = v_tenant_id
  ),
  failure_cats as (
    select jsonb_agg(jsonb_build_object('category', fc.category, 'count', fc.cnt)) as cats
    from (
      select failure_category as category, count(*) as cnt
      from public.guardian_notification_outbox
      where tenant_id = v_tenant_id
        and failure_category is not null
        and status in ('failed', 'cancelled')
        and coalesce(failed_at, cancelled_at) >= v_window_start
      group by failure_category
      order by count(*) desc
      limit 10
    ) fc
  )
  select
    coalesce(agg.p_pending, 0),
    coalesce(agg.p_processing, 0),
    coalesce(agg.p_delivered_recent, 0),
    coalesce(agg.p_failed_recent, 0),
    coalesce(agg.p_cancelled_recent, 0),
    coalesce(agg.p_oldest_pending, 0),
    coalesce(failure_cats.cats, '[]'::jsonb)
  from agg cross join failure_cats;
end;
$$;

comment on function public.get_tenant_notification_delivery_summary(integer) is
  'Tenant-scoped notification-delivery summary for operational administrators. '
  'Returns pending/processing/recent-delivered/recent-failed/cancelled counts, '
  'oldest pending age in seconds, and recent normalized failure categories. '
  'Excludes all personal information (recipient emails, guardian/student names, '
  'message bodies, provider message IDs, outbox IDs). Platform Super Admin is '
  'deliberately denied access. Allowed roles: tenant_admin, school_admin, '
  'transportation_admin.';

revoke all on function public.get_tenant_notification_delivery_summary(integer) from public, anon;
grant execute on function public.get_tenant_notification_delivery_summary(integer) to authenticated;