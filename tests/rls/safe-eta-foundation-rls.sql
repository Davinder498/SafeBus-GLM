-- Phase 14B Safe ETA hosted-DEV RLS/regression checks.
-- Destructive only to deterministic 14B QA fixture ids; run with pnpm test:rls:dev tests/rls/safe-eta-foundation-rls.sql against hosted DEV.

begin;


-- Function contract checks: these fail if expected safe fields disappear.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'calculate_safe_route_eta') then
    raise exception 'missing calculate_safe_route_eta';
  end if;
  if not exists (select 1 from pg_proc where proname = 'get_guardian_live_trip_visibility') then
    raise exception 'missing guardian ETA RPC';
  end if;
  if not exists (select 1 from pg_proc where proname = 'get_admin_live_fleet_monitoring') then
    raise exception 'missing admin fleet ETA RPC';
  end if;
end $$;

-- Direction and safety checks can run without impersonation because the helper is pure server-side route math.
do $$
declare
  v_route uuid := '14b00000-0000-0000-0000-000000000013';
  v_pickup uuid := '14b00000-0000-0000-0000-000000000015';
  r record;
begin
  select * into r from public.calculate_safe_route_eta(v_route, v_pickup, 'morning', 51.0060, -114.0000, 8, now());
  if r.eta_status <> 'available' or r.target_stop_order <> 2 then
    raise exception 'morning ETA should target pickup stop order 2 and be available, got %, %', r.eta_status, r.target_stop_order;
  end if;

  select * into r from public.calculate_safe_route_eta(v_route, v_pickup, 'morning', 51.0180, -114.0000, 8, now());
  if r.eta_status <> 'passed_stop' then
    raise exception 'morning passed-stop check failed: %', r.eta_status;
  end if;

  select * into r from public.calculate_safe_route_eta(v_route, v_pickup, 'evening', 51.0180, -114.0000, 8, now());
  if r.eta_status <> 'available' or r.target_stop_order <> 2 then
    raise exception 'evening reverse-direction ETA should target dropoff stop order 2 and be available, got %, %', r.eta_status, r.target_stop_order;
  end if;

  select * into r from public.calculate_safe_route_eta(v_route, v_pickup, 'evening', 51.0005, -114.0000, 8, now());
  if r.eta_status <> 'passed_stop' then
    raise exception 'evening passed-stop check failed: %', r.eta_status;
  end if;

  select * into r from public.calculate_safe_route_eta(v_route, v_pickup, 'morning', 51.0060, -114.0000, 8, now() - interval '5 minutes');
  if r.eta_status <> 'stale_location' or r.eta_min_minutes is not null then
    raise exception 'stale location should suppress ETA, got %, %', r.eta_status, r.eta_min_minutes;
  end if;

  select * into r from public.calculate_safe_route_eta(v_route, v_pickup, 'morning', 51.0060, -114.0000, 8, now() + interval '5 minutes');
  if r.eta_status <> 'future_location' or r.eta_min_minutes is not null then
    raise exception 'future timestamp should suppress ETA, got %, %', r.eta_status, r.eta_min_minutes;
  end if;

  select * into r from public.calculate_safe_route_eta(v_route, v_pickup, 'morning', 999, -114.0000, 8, now());
  if r.eta_status <> 'invalid_location' then
    raise exception 'invalid coordinates should suppress ETA, got %', r.eta_status;
  end if;

  select * into r from public.calculate_safe_route_eta(v_route, v_pickup, 'morning', 51.0060, -114.0000, null, now());
  if r.eta_status <> 'available' or r.eta_min_minutes is null or r.eta_max_minutes < r.eta_min_minutes then
    raise exception 'null speed fallback should produce safe range, got %, %, %', r.eta_status, r.eta_min_minutes, r.eta_max_minutes;
  end if;
end $$;

-- Platform Super Admin must not be included in the operational admin ETA RPC allowlist.
do $$
declare
  def text;
begin
  select pg_get_functiondef('public.get_admin_live_fleet_monitoring()'::regprocedure) into def;
  if def like '%platform_super_admin%' then
    raise exception 'admin fleet ETA RPC still references platform_super_admin allowlist';
  end if;
end $$;

rollback;
