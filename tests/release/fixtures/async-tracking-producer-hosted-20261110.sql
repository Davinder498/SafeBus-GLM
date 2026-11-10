-- Read-only hosted catalog observation, 2026-11-10. No customer records.
CREATE OR REPLACE FUNCTION safebus_private.notify_tracking_location_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
begin
  perform safebus_private.broadcast_route_tracking_invalidation(
    new.tenant_id,
    new.route_id,
    'location'
  );
  return null;
end;
$function$;
REVOKE ALL ON FUNCTION safebus_private.notify_tracking_location_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION safebus_private.notify_tracking_location_change() TO authenticated, service_role;
