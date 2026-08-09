-- SafeBus Alberta - reconcile the verified-MFA session helper
--
-- Hosted DEV was created before the current Phase 2 helper contract was
-- finalized. Reapply the idempotent definition so every environment evaluates
-- the signed Supabase JWT assurance level consistently.

create or replace function public.has_verified_mfa()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

comment on function public.has_verified_mfa() is
  'Returns true only for an authenticated Supabase session whose signed JWT assurance level is aal2.';
