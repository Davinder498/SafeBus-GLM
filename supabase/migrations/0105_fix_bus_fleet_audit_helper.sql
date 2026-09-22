-- Repair the internal audit call used by the bus create, update, and
-- onboarding RPCs introduced in 0102. The audit writer has always lived in
-- public; those RPCs call this missing private-schema name after their writes.
-- Keep the existing RPC signatures and access controls unchanged.

create function safebus_private.write_audit_event(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_target_label text,
  p_outcome text,
  p_detail jsonb,
  p_ip_address inet
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.write_audit_event(
    p_action,
    p_target_type,
    p_target_id,
    p_target_label,
    p_outcome,
    p_detail,
    p_ip_address
  );
end;
$$;

revoke all on function safebus_private.write_audit_event(
  text, text, uuid, text, text, jsonb, inet
) from public, anon, authenticated, service_role;

comment on function safebus_private.write_audit_event(
  text, text, uuid, text, text, jsonb, inet
) is 'Internal compatibility shim for bus RPC audit calls; delegates to the existing authenticated audit writer.';
