-- SafeBus Alberta - enforce QR-only driver trip start
--
-- Driver assignments remain available to administrators for scheduling and
-- operational planning. Drivers no longer receive a browser-executable path
-- that can create a trip from an assignment without scanning the bus QR and
-- creating a short-lived phone-to-bus GPS session.

revoke execute on function public.get_current_driver_trip_assignments() from authenticated;
revoke execute on function public.start_driver_trip_from_assignment(uuid) from authenticated;

comment on function public.get_current_driver_trip_assignments() is
  'Retired driver browser contract. Driver assignments remain admin planning data; drivers start prepared runs by scanning the bus QR.';

comment on function public.start_driver_trip_from_assignment(uuid) is
  'Retired driver browser entrypoint. Driver trips must start through start_bus_tracking_from_qr(text), which binds the active driver phone to the prepared bus run.';
