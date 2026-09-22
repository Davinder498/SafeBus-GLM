-- SafeBus Alberta - refresh the fleet-number API schema cache (0103)
--
-- Migration 0102 adds the administrator bus RPCs after PostgREST is already
-- running. Explicitly invalidate its schema cache at transaction commit so an
-- existing tenant can use admin_update_bus immediately after the migration is
-- released instead of receiving PGRST202/HTTP 404 for the new function.

select pg_notify('pgrst', 'reload schema');
