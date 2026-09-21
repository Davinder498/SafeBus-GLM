-- Route definition edits temporarily move existing stops out of the requested
-- order range before applying the new sequence. PostgreSQL's default immediate
-- uniqueness check can reject a valid reorder when an archived stop already
-- occupies one of those temporary positions. Defer the invariant until the RPC
-- transaction completes, when every stop has its final unique position.

alter table public.route_stops
  drop constraint if exists route_stops_route_order_unique;

alter table public.route_stops
  add constraint route_stops_route_order_unique
  unique (route_id, stop_order)
  deferrable initially deferred;

comment on constraint route_stops_route_order_unique on public.route_stops is
  'Keeps stop order unique per route while allowing admin_save_route_definition to reorder stops atomically within one transaction.';
