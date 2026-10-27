// Embedded PostgreSQL only: synthetic source records, no credentials or network.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const read = (name) => readFile(new URL(`../../../${name}`, import.meta.url), 'utf8');
export const definition = (sql, name) => {
  const escaped = name.replaceAll('.', '\\.');
  const match = sql.match(
    new RegExp(
      `create(?: or replace)? function ${escaped}\\([\\s\\S]*?(?:\\$\\$;|\\$function\\$;)`,
      'i',
    ),
  );
  if (!match) throw new Error(`Missing function ${name}`);
  return match[0];
};
export const migrationPath =
  'supabase/migrations/pending/20261027120000_notification_templates.sql';
export const readMigration = () => read(migrationPath);

export async function createNotificationTemplateDb({ migrate = true } = {}) {
  const db = new PGlite();
  try {
    await db.exec(await read('tests/release/fixtures/tracking-worker-baseline.sql'));
    await db.exec(await read('tests/release/fixtures/trip-notification-baseline.sql'));
    await db.exec(`
      set check_function_bodies=false;
      create schema extensions;
      alter table profiles add full_name text, add email text;
      alter table tenants add timezone text default 'America/Edmonton';
      create table schools(id uuid primary key,tenant_id uuid,status text default 'active');
      alter table students add school_id uuid, add preferred_name text, add first_name text;
      alter table buses add bus_number text;
      alter table routes add route_code text, add route_name text;
      alter table route_trip_patterns add display_name text;
      alter table driver_trips add started_at timestamptz default now(),add ended_at timestamptz,
        add bus_number_snapshot text,add trip_name_snapshot text;
      create table driver_route_assignments(id uuid primary key,tenant_id uuid,driver_id uuid,bus_id uuid,route_id uuid,
        trip_type text default 'outbound',status text default 'active',effective_from date,effective_to date,updated_at timestamptz default clock_timestamp());
      alter table student_trip_events add driver_trip_id uuid, add event_time timestamptz default now();
      alter table student_guardians add updated_at timestamptz default clock_timestamp();
      alter table guardian_student_push_preferences add preferences_set_at timestamptz,add updated_at timestamptz;
      create unique index guardian_link_category on guardian_student_push_preferences(student_guardian_id,category);
      alter table student_bus_assignments add seat_number int, add updated_at timestamptz default clock_timestamp();
      create table trip_operational_statuses(id uuid primary key,tenant_id uuid,driver_trip_id uuid,
        operational_status text,reason_code text,set_at timestamptz default clock_timestamp());
      create table trip_exceptions(id uuid primary key,tenant_id uuid,driver_trip_id uuid,exception_type text,occurred_at timestamptz default now());
      alter table user_notification_settings add in_app_enabled boolean default true,add updated_at timestamptz,
        add quiet_hours_enabled boolean default false,add quiet_hours_start time default '21:00',
        add quiet_hours_end time default '07:00',add timezone_override text,add urgent_bypass_quiet_hours boolean default false;
      alter table user_notification_category_preferences add in_app_enabled boolean default true, add updated_at timestamptz;
      alter table push_notification_outbox add provider_message_id text,add failure_code text,add provider_retry_after_seconds integer,add last_error_at timestamptz,add failed_at timestamptz;
      alter table android_push_devices add invalidated_at timestamptz,add last_failure_category text;
      alter table user_notifications add constraint user_notifications_event_type_check check(true),add constraint user_notifications_source_type_check check(true);
      alter table guardian_notification_outbox add constraint guardian_notification_outbox_type_check check(true);
      create unique index email_notification_unique on guardian_notification_outbox(tenant_id,guardian_id,user_notification_id,notification_type) where user_notification_id is not null;
      create or replace function public.is_current_user_session_active() returns boolean language sql stable as $$ select coalesce(current_setting('test.active',true),'true') = 'true' $$;
      create function safebus_private.has_completed_optional_mfa() returns boolean language sql stable as $$ select coalesce(current_setting('test.mfa',true),'true') = 'true' $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',case when coalesce(current_setting('test.mfa',true),'true')='true' then 'aal2' else 'aal1' end) $$;
      create function safebus_private.has_verified_mfa() returns boolean language sql stable as $$ select auth.uid() is not null and coalesce(auth.jwt()->>'aal','aal1')='aal2' $$;
      create function safebus_private.enforce_mfa_if_required() returns void language plpgsql as $$ begin
        if not safebus_private.has_completed_optional_mfa() then raise exception 'MFA required'; end if; end; $$;
      create function safebus_private.current_tenant_id() returns uuid language sql stable as $$ select tenant_id from public.profiles where id=auth.uid() $$;
      create function safebus_private.current_user_role() returns public.user_role language sql stable as $$ select role from public.profiles where id=auth.uid() $$;
      create function safebus_private.guardian_email_outbox_is_eligible_legacy(uuid) returns boolean language sql as $$ select false $$;
      create function safebus_private.guardian_trip_notification_is_eligible(public.user_notifications,boolean) returns boolean language sql as $$ select false $$;
    `);
    const base = await read('supabase/migrations/0092_end_to_end_notification_system.sql');
    for (const name of [
      'safebus_private.send_notification_invalidation',
      'safebus_private.enqueue_user_notification',
      'safebus_private.notification_is_urgent',
      'public.complete_push_notification_delivery',
      'public.retry_push_notification_delivery',
      'public.fail_push_notification_delivery',
    ]) {
      await db.exec(definition(base, name));
    }
    await db.exec('drop function safebus_private.next_push_availability(uuid,uuid,text)');
    await db.exec(definition(base, 'safebus_private.next_push_availability'));
    await db.exec(
      await read('supabase/migrations/pending/20261025002759_authority_announcements.sql'),
    );
    await db.exec(
      await read(
        'supabase/migrations/pending/20261026194051_announcement_guardian_school_scope.sql',
      ),
    );
    await db.exec(await read('tests/release/fixtures/notification-templates-hosted-20261027.sql'));
    await db.exec(`
      create trigger visibility before insert on user_notifications for each row execute function safebus_private.capture_notification_inbox_visibility();
      create trigger driver_scope before insert on user_notifications for each row execute function safebus_private.enforce_driver_assignment_only_notification();
    `);
    // Validate the actual forward SQL, including dependency resolution. Historical
    // fixture bootstrap alone needs deferred body checking; the migration does not.
    await db.exec('set check_function_bodies=true');
    if (migrate) await db.exec(await readMigration());
    await db.exec(`
      insert into tenants(id) values('${id(1)}'),('${id(99)}');
      insert into schools(id,tenant_id) values('${id(8)}','${id(1)}'),('${id(98)}','${id(99)}');
      insert into profiles(id,tenant_id,role,school_id,full_name) values
        ('${id(2)}','${id(1)}','guardian',null,'Private Guardian'),('${id(3)}','${id(1)}','driver',null,'Private Driver'),
        ('${id(4)}','${id(1)}','tenant_admin',null,'School authority admin'),('${id(5)}',null,'platform_super_admin',null,'Platform admin'),
        ('${id(6)}','${id(1)}','school_admin','${id(8)}','School admin'),('${id(97)}','${id(99)}','guardian',null,'Other guardian');
      insert into guardians(id,tenant_id,profile_id) values('${id(12)}','${id(1)}','${id(2)}'),('${id(96)}','${id(99)}','${id(97)}');
      insert into drivers(id,tenant_id,profile_id) values('${id(13)}','${id(1)}','${id(3)}');
      insert into students(id,tenant_id,school_id,first_name) values
        ('${id(14)}','${id(1)}','${id(8)}','Private Student'),('${id(15)}','${id(1)}','${id(8)}','Private Sibling');
      insert into student_guardians(id,tenant_id,guardian_id,student_id) values
        ('${id(16)}','${id(1)}','${id(12)}','${id(14)}'),('${id(17)}','${id(1)}','${id(12)}','${id(15)}');
      insert into buses(id,tenant_id,bus_number) values('${id(20)}','${id(1)}','Demo 01');
      insert into routes(id,tenant_id,school_id,route_code,route_name) values('${id(21)}','${id(1)}','${id(8)}','Demo 01','Demo route');
      insert into route_trip_patterns(id,tenant_id,route_id,display_name) values('${id(22)}','${id(1)}','${id(21)}','Outbound');
      insert into bus_route_assignments(id,tenant_id,bus_id,route_id,route_trip_pattern_id) values('${id(23)}','${id(1)}','${id(20)}','${id(21)}','${id(22)}');
      insert into student_bus_assignments(id,tenant_id,student_id,bus_route_assignment_id,route_trip_pattern_id)
        values('${id(24)}','${id(1)}','${id(14)}','${id(23)}','${id(22)}'),('${id(25)}','${id(1)}','${id(15)}','${id(23)}','${id(22)}');
      insert into guardian_notification_delivery_policies(tenant_id) values('${id(1)}'),('${id(99)}');
      insert into user_notification_settings(profile_id,tenant_id) select id,tenant_id from profiles;
      insert into user_notification_category_preferences(profile_id,category)
        select p.id,c from profiles p cross join unnest(array['pickup_dropoff','trip_status','operations','service_changes','assignments','delivery_health','platform']) c;
      insert into guardian_student_push_preferences(student_guardian_id,category,push_enabled) select sg.id,c,true from student_guardians sg cross join unnest(array['pickup_dropoff','trip_status','operations','service_changes']) c on conflict(student_guardian_id,category) do update set push_enabled=true;
      insert into android_push_devices(id,tenant_id,profile_id) values
        ('${id(30)}','${id(1)}','${id(2)}'),('${id(31)}','${id(1)}','${id(3)}'),('${id(32)}','${id(1)}','${id(2)}');
      create trigger trip_event after insert on student_trip_events for each row execute function safebus_private.on_student_trip_event_notification();
      create trigger trip_status after insert or update of status on driver_trips for each row execute function safebus_private.on_driver_trip_notification();
      create trigger operational_status after insert or update of operational_status,reason_code on trip_operational_statuses for each row execute function safebus_private.on_trip_operational_status_notification();
      create trigger exception after insert on trip_exceptions for each row execute function safebus_private.on_trip_exception_notification();
      create trigger assignment after insert or update on driver_route_assignments for each row execute function safebus_private.on_driver_assignment_notification();
      create trigger student_service after insert or update on student_bus_assignments for each row execute function safebus_private.on_student_service_notification();
      truncate user_notifications,push_notification_outbox;
      select set_config('request.jwt.claim.role','service_role',false);
    `);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function startTrip(db, number = 40) {
  await db.query(
    `insert into driver_trips(id,tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id,bus_number_snapshot,trip_name_snapshot)
    values($1,$2,$3,$4,$5,$6,'Demo 01','Outbound')`,
    [id(number), id(1), id(13), id(20), id(21), id(22)],
  );
}
