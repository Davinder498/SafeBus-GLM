import fs from 'node:fs/promises';
import { serviceDateDb, serviceDateMigration, id } from './service-dates-db.mjs';
export { id };
export const calendarBaseline = async () =>
  JSON.parse(
    await fs.readFile(new URL('./route-calendar-hosted-20261102.json', import.meta.url), 'utf8'),
  );
export const calendarMigration = () =>
  fs.readFile(
    new URL(
      '../../../supabase/migrations/pending/20261102193116_route_service_calendar.sql',
      import.meta.url,
    ),
    'utf8',
  ).then(sql => sql.replaceAll('\r', ''));
export async function routeCalendarDb({ security = false } = {}) {
  const db = await serviceDateDb();
  try {
    await db.exec(await serviceDateMigration());
    await db.exec(`
   alter table routes alter column id set default gen_random_uuid();
   alter table bus_run_dispatches add column prepared_at timestamptz default now();
   alter table routes add column route_type text,add column route_kind text default 'regular',add column map_color text default '#2563EB';
   create table if not exists schools(id uuid primary key);
   alter table schools add column tenant_id uuid,add column status text default 'active';
   create table route_service_days(id uuid default gen_random_uuid(),tenant_id uuid,route_id uuid,day_of_week smallint,status text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(route_id,day_of_week));
   alter table route_stops alter column id set default gen_random_uuid();
   alter table route_stops add column school_id uuid,add column latitude numeric,add column longitude numeric,add column planned_arrival_time time;
   alter table route_trip_patterns alter column id set default gen_random_uuid();
   create unique index test_route_direction on route_trip_patterns(route_id,direction);
   create unique index test_stop_schedule on route_trip_stop_schedules(route_trip_pattern_id,route_stop_id);
   create function safebus_private.route_definition_is_ready(uuid) returns boolean language sql as $$select count(*)>=2 from public.route_stops where route_id=$1 and status='active' and latitude is not null and longitude is not null$$;
   grant insert,update,delete on public.routes,public.route_stops,public.route_trip_patterns,public.route_trip_stop_schedules,public.route_service_days to authenticated;
   grant select on public.route_service_days,public.schools to authenticated;
  `);
    const baseline = await calendarBaseline();
    for (const fn of baseline.functions) {
      await db.exec(fn.definition);
      await db.exec(
        `revoke all on function ${fn.signature} from public,anon,authenticated,service_role`,
      );
      if (fn.acl.some((acl) => acl.startsWith('authenticated=')))
        await db.exec(`grant execute on function ${fn.signature} to authenticated`);
      if (fn.acl.some((acl) => acl.startsWith('service_role=')))
        await db.exec(`grant execute on function ${fn.signature} to service_role`);
    }
    if (security) {
      await db.exec(`
    create table auth.mfa_factors(user_id uuid,status text);
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('test.aal',true))$$;
    create function auth.role() returns text language sql stable as $$select current_user::text$$;
    create function public.is_current_user_session_active() returns boolean language sql stable as $$select coalesce(current_setting('test.active',true),'true')='true'$$;
    select set_config('test.aal','aal2',false);
   `);
      const catalog = JSON.parse(
        await fs.readFile(
          new URL('./route-calendar-security-20261102.json', import.meta.url),
          'utf8',
        ),
      );
      for (const fn of catalog.functions) await db.exec(fn.definition);
      for (const p of catalog.policies) {
        await db.exec(`alter table public.${p.tablename} enable row level security;
     create policy "${p.policyname}" on public.${p.tablename} as ${p.permissive} for ${p.cmd} to authenticated
      ${p.qual ? `using (${p.qual})` : ''} ${p.with_check ? `with check (${p.with_check})` : ''}`);
      }
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
