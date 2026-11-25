-- Candidate only: not a migration and never exposed via PostgREST.
-- The trusted gateway must verify each JWT cryptographically before passing claims.
-- Reuse the exact installed driver RPC. Never grant this wrapper to a client role.
create function safebus_private.ingest_verified_driver_location_batch(p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $batch$
declare
  item jsonb;
  claims jsonb;
  fix jsonb;
  result jsonb;
  items jsonb[];
  results jsonb[] := '{}'::jsonb[];
  old_claims text := pg_catalog.current_setting('request.jwt.claims',true);
  old_claim text := pg_catalog.current_setting('request.jwt.claim',true);
  old_sub text := pg_catalog.current_setting('request.jwt.claim.sub',true);
  old_role text := pg_catalog.current_setting('request.jwt.claim.role',true);
begin
  if pg_catalog.jsonb_typeof(p_items) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_items) not between 1 and 100
     or pg_catalog.pg_column_size(p_items) > 524288 then
    raise exception 'Invalid GPS batch' using errcode='22023';
  end if;
  if (select count(distinct e->'fix'->>'p_device_credential')
      from pg_catalog.jsonb_array_elements(p_items) e) <> pg_catalog.jsonb_array_length(p_items)
     or (select count(distinct e->>'id') from pg_catalog.jsonb_array_elements(p_items) e)
        <> pg_catalog.jsonb_array_length(p_items) then
    raise exception 'Duplicate or missing batch identity' using errcode='22023';
  end if;
  -- Consistent credential-hash order reduces cross-batch lock inversions.
  select pg_catalog.array_agg(e order by
    pg_catalog.sha256(pg_catalog.convert_to(e->'fix'->>'p_device_credential','UTF8')))
    into items from pg_catalog.jsonb_array_elements(p_items) e;
  begin
    foreach item in array items loop
      claims := item->'claims';
      fix := item->'fix';
      if pg_catalog.jsonb_typeof(claims) is distinct from 'object'
         or claims->>'role' is distinct from 'authenticated'
         or coalesce(claims->>'sub','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or coalesce(claims->>'session_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or coalesce(claims->>'aal','') not in ('aal1','aal2')
         or coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
         or (claims->>'exp')::bigint <= extract(epoch from pg_catalog.clock_timestamp())
         or pg_catalog.jsonb_typeof(fix) is distinct from 'object' then
        results := pg_catalog.array_append(results,pg_catalog.jsonb_build_object('id',item->>'id','status',401));
        continue;
      end if;
      -- Override BOTH legacy and current GUCs; no identity bleed across items.
      perform pg_catalog.set_config('request.jwt.claims',claims::text,true);
      perform pg_catalog.set_config('request.jwt.claim',claims::text,true);
      perform pg_catalog.set_config('request.jwt.claim.sub',claims->>'sub',true);
      perform pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
      result := public.ingest_driver_location_event(
        fix->>'p_tracking_token',fix->>'p_device_credential',
        (fix->>'p_event_id')::uuid,(fix->>'p_sequence')::bigint,
        (fix->>'p_recorded_at')::timestamptz,
        (fix->>'p_latitude')::double precision,(fix->>'p_longitude')::double precision,
        (fix->>'p_accuracy_m')::double precision,(fix->>'p_heading_deg')::double precision,
        (fix->>'p_speed_mps')::double precision,(fix->>'p_battery_percent')::integer,
        fix->>'p_connectivity');
      results := pg_catalog.array_append(results,pg_catalog.jsonb_build_object('id',item->>'id','status',200,'body',result));
    end loop;
  exception when insufficient_privilege then
    -- PostgreSQL reverted all writes and claim changes from this attempt.
    -- Retry singleton batches in the same lock order to isolate the denial.
    -- Any other error must abort the transaction and prevent acknowledgements.
    if pg_catalog.cardinality(items) = 1 then
      return pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',item->>'id','status',403));
    end if;
    results := '{}'::jsonb[];
    foreach item in array items loop
      result := safebus_private.ingest_verified_driver_location_batch(pg_catalog.jsonb_build_array(item));
      results := pg_catalog.array_append(results,result->0);
    end loop;
  end;
  perform pg_catalog.set_config('request.jwt.claims',coalesce(old_claims,''),true);
  perform pg_catalog.set_config('request.jwt.claim',coalesce(old_claim,''),true);
  perform pg_catalog.set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform pg_catalog.set_config('request.jwt.claim.role',coalesce(old_role,''),true);
  return pg_catalog.to_jsonb(results);
end
$batch$;
revoke all on function safebus_private.ingest_verified_driver_location_batch(jsonb)
from public,anon,authenticated,service_role;
