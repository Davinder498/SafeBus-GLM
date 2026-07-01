-- SafeBus Alberta - foundation read grants
--
-- Grants required for authenticated Supabase clients to read the foundation
-- tables. Row Level Security remains enabled and continues to constrain rows.

grant usage on schema public to authenticated;

grant select on table public.tenants to authenticated;
grant select on table public.schools to authenticated;
grant select on table public.profiles to authenticated;
