-- SafeBus Alberta - enforce assignment-only driver trip start
--
-- Corrective migration for Milestone 4F Codex review blocker.
--
-- Problem:
--   Migration 0006 created a "driver_trips insert own driver" RLS policy and
--   granted INSERT on public.driver_trips to authenticated. This allowed any
--   authenticated driver to insert a driver_trips row directly via the Supabase
--   REST API for any active bus/route in their tenant — bypassing the
--   assignment requirement that Milestone 4F enforces.
--
--   The new start_driver_trip_from_assignment() RPC (from 0013) is the intended
--   secure path: it validates the assignment, derives bus/route/trip_type from
--   the assignment row, and enforces caller ownership. But while the direct
--   insert policy remained, a driver could bypass it.
--
-- Fix:
--   1. Drop the "driver_trips insert own driver" policy.
--   2. Revoke INSERT on public.driver_trips from authenticated.
--   3. The start_driver_trip_from_assignment() RPC (SECURITY DEFINER) remains
--      the ONLY path that can create a driver_trips row. It bypasses RLS
--      internally (as owner) and enforces assignment validation itself.
--
-- Security:
--   - Drivers can no longer insert driver_trips directly via REST.
--   - The RPC is the sole driver trip-start path.
--   - No existing RLS policies are weakened (only the insert policy is removed).
--   - SELECT and the end_driver_trip() RPC are unchanged.
--   - No data is deleted. No tables are altered.

-- Drop the direct driver insert policy.
drop policy if exists "driver_trips insert own driver" on public.driver_trips;

-- Revoke direct INSERT from authenticated. The start_driver_trip_from_assignment()
-- RPC is SECURITY DEFINER and inserts as the function owner, so it does not need
-- the authenticated role to have INSERT on the table.
revoke insert on table public.driver_trips from authenticated;

-- Confirm: SELECT remains (drivers read own trips; admins read tenant trips).
-- The end_driver_trip() RPC and start_driver_trip_from_assignment() RPC are
-- SECURITY DEFINER and do not need table-level INSERT/UPDATE grants.
-- No further grants needed here.
