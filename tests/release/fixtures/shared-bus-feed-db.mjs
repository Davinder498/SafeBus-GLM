import fs from 'node:fs/promises';
import { trackingReleaseFixture } from './async-tracking-release-db.mjs';

export const sharedMigration =
  'supabase/migrations/pending/20261115121343_shared_bus_tracking_feed.sql';
export async function sharedFeedFixture(t) {
  const db = await trackingReleaseFixture(t);
  await db.exec(
    await fs.readFile('supabase/migrations/pending/0125_async_tracking_invalidations.sql', 'utf8'),
  );
  await db.exec(
    await fs.readFile(
      'supabase/migrations/pending/20261115104653_batch_tracking_refresh_messages.sql',
      'utf8',
    ),
  );
  await db.exec(`create schema auth;
    create type public.user_role as enum('guardian','driver','tenant_admin','school_admin','transportation_admin','platform_admin');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function safebus_private.current_tenant_id() returns uuid language sql stable as $$ select nullif(current_setting('test.tenant',true),'')::uuid $$;
    create function safebus_private.current_user_role() returns public.user_role language sql stable as $$ select coalesce(nullif(current_setting('test.role',true),''),'guardian')::public.user_role $$;
    create function safebus_private.current_guardian_id() returns uuid language sql stable as $$ select id from public.guardians where profile_id=auth.uid() and tenant_id=safebus_private.current_tenant_id() and status='active' $$;
    create or replace function public.is_current_user_session_active() returns boolean language sql stable as $$ select current_setting('test.session',true) = 'active' $$;
    create function safebus_private.has_completed_optional_mfa() returns boolean language sql stable as $$ select current_setting('test.mfa',true) = 'complete' $$;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
    alter table realtime.messages enable row level security;
    grant usage on schema realtime,auth to authenticated;
    grant select,insert on realtime.messages to authenticated;
  `);
  await db.exec(
    await fs.readFile('tests/release/fixtures/guardian-service-lines-hosted-20261115.sql', 'utf8'),
  );
  await db.exec(
    'revoke all on function public.get_guardian_bus_service_lines(text) from public; grant execute on function public.get_guardian_bus_service_lines(text) to authenticated,service_role;',
  );
  return db;
}
