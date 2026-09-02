-- Schedule the reviewed Supabase Edge Function without embedding credentials.
-- The job stays fail-closed until the two named Vault secrets are configured
-- through the protected, human-approved release procedure.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- pg_cron updates the existing job when the same unique name is scheduled.
select cron.schedule(
  'safebus-push-notification-dispatcher',
  '* * * * *',
  $schedule$
    with dispatcher_configuration as (
      select
        max(decrypted_secret) filter (where name = 'safebus_project_url') as project_url,
        max(decrypted_secret) filter (where name = 'safebus_push_dispatcher_secret') as dispatcher_secret
      from vault.decrypted_secrets
      where name in ('safebus_project_url', 'safebus_push_dispatcher_secret')
    )
    select net.http_post(
      url := rtrim(project_url, '/') || '/functions/v1/push-notification-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-safebus-push-secret', dispatcher_secret
      ),
      body := jsonb_build_object('source', 'pg_cron')
    )
    from dispatcher_configuration
    where project_url ~ '^https://[a-z0-9-]+[.]supabase[.]co$'
      and length(dispatcher_secret) >= 32;
  $schedule$
);

commit;
