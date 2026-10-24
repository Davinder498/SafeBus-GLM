-- Prepared only: release through the protected production workflow after
-- recovery verification, hosted reconciliation and bounded rollback rehearsal.
-- The official domain is already owner-approved (official-domain-setup.md).
-- Preserve the legacy Netlify origin and all school-authority-specific entries.
insert into public.allowed_redirect_origins (tenant_id, origin)
values (null, 'https://safebus.kids')
on conflict do nothing;
