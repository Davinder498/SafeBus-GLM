// Embedded PostgreSQL only. Compose existing tracking/disposal baselines; never connect to BusSafe.
import fs from 'node:fs/promises';
import {
  trackingQueueDb,
  queueMigration,
  start,
  register,
  bind,
  id,
} from './tracking-queue-db.mjs';
import { fixture as disposalDb } from './complete-disposal-schema.mjs';
export { id, start, register, bind, ingest } from './tracking-queue-db.mjs';
export const migrationPath = 'supabase/migrations/pending/20261109214533_remove_gps_history.sql';
export const migration = () =>
  fs.readFile(migrationPath, 'utf8').then((s) => s.replaceAll('\r', ''));
const quoted = (s) => '"' + s.replaceAll('"', '""') + '"';
export async function baseline() {
  const db = await trackingQueueDb();
  const reference = await disposalDb();
  try {
    await db.exec(await queueMigration());
    // Copy missing fixture columns/functions, not customer data or auth identities.
    const tables = (
      await reference.query(`select n.nspname,c.relname,c.oid from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where c.relkind='r' and n.nspname in ('public','safebus_private','storage')`)
    ).rows;
    await db.exec('create schema storage; create schema cron; set check_function_bodies=off');
    for (const t of tables) {
      const name = quoted(t.nspname) + '.' + quoted(t.relname);
      const columns = (
        await reference.query(
          `select a.attname,format_type(a.atttypid,a.atttypmod) as type,
        pg_get_expr(d.adbin,d.adrelid) as default_value from pg_attribute a
        left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
        where a.attrelid=$1 and a.attnum>0 and not a.attisdropped order by a.attnum`,
          [t.oid],
        )
      ).rows;
      await db.exec(
        'create table if not exists ' +
          name +
          '(' +
          columns
            .map(
              (c) =>
                quoted(c.attname) +
                ' ' +
                c.type +
                (c.default_value ? ' default ' + c.default_value : ''),
            )
            .join(',') +
          ')',
      );
      for (const c of columns)
        await db.exec(
          'alter table ' +
            name +
            ' add column if not exists ' +
            quoted(c.attname) +
            ' ' +
            c.type +
            (c.default_value ? ' default ' + c.default_value : ''),
        );
    }
    for (const f of (
      await reference.query(`select p.oid::regprocedure::text as signature,
      pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','safebus_private','auth') and p.prokind='f'`)
    ).rows) {
      if (
        !(await db.query('select to_regprocedure($1) is not null as present', [f.signature]))
          .rows[0].present
      )
        await db.exec(f.definition);
    }
    await db.exec(`alter table driver_trip_location_updates add column if not exists created_at timestamptz default now();
      alter table profiles add column if not exists updated_at timestamptz default now();
      create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text);
      create function cron.schedule(text,text,text) returns bigint language sql as
      $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid$$;
      insert into public.retention_execution_control(id,destructive_enabled) values(1,false);
      grant usage on schema cron to authenticated;
    `);
    const captured = JSON.parse(
      await fs.readFile('tests/release/fixtures/gps-history-hosted-20261109.json', 'utf8'),
    );
    const extra = JSON.parse(
      await fs.readFile('tests/release/fixtures/gps-history-extra-hosted-20261109.json', 'utf8'),
    );
    for (const f of [...captured.functions, extra.function]) await db.exec(f.definition);
    const agreementGate = JSON.parse(
      await fs.readFile(
        'tests/release/fixtures/tracking-agreement-gate-hosted-20261109.json',
        'utf8',
      ),
    );
    await db.exec(agreementGate.definition);
    await db.exec(`create function public.district_agreement_billing_allowed(uuid) returns boolean
      language sql as $$select coalesce(current_setting('test.agreement_allowed',true),'true')<>'false'$$;
      create trigger district_contract_write_gate before insert or update or delete on driver_trip_current_locations
        for each row execute function safebus_private.guard_new_tenant_operations();
    `);
    const reviewed = JSON.parse(
      await fs.readFile('config/pending/live-tracking-only.json', 'utf8'),
    );
    for (const f of reviewed.before.functions.filter((f) => f.md5 !== null)) {
      await db.exec(
        'revoke all on function ' + f.signature + ' from public,anon,authenticated,service_role',
      );
      for (const role of ['anon', 'authenticated', 'service_role'])
        if (f.acl.some((a) => a.startsWith(role + '=X/')))
          await db.exec('grant execute on function ' + f.signature + ' to ' + role);
    }
    await db.exec(`create table realtime.captured(topic text,event text,payload jsonb,private boolean);
      create function realtime.send(payload jsonb,event text,topic text,private boolean)
      returns void language sql as $$insert into realtime.captured values($3,$2,$1,$4)$$;
      alter table student_route_assignments add column if not exists tenant_id uuid,
        add column if not exists route_id uuid,add column if not exists student_id uuid,
        add column if not exists status text default 'active',add column if not exists effective_to date;
    `);
    const signals = JSON.parse(
      await fs.readFile(
        'tests/release/fixtures/live-tracking-signals-hosted-20261109.json',
        'utf8',
      ),
    );
    for (const f of signals.functions) await db.exec(f.definition);
    await db.exec(`create trigger notify_tracking_location_change after insert or update on driver_trip_current_locations
      for each row execute function safebus_private.notify_tracking_location_change();
      insert into student_route_assignments(id,tenant_id,student_id,route_id,effective_from)
        values('${id(33)}','${id(1)}','${id(30)}','${id(21)}',(now() at time zone 'America/Edmonton')::date);
    `);
    for (const p of captured.policies) {
      await db.query(
        `insert into retention_policies(policy_key,retention_days,expiry_action,active)
        values($1,$2,$3,$4)`,
        [p.policy_key, p.retention_days, p.expiry_action, p.active],
      );
    }
    // The fixture table initially lacks a PK; source metadata needs the real columns.
    await db.exec(`alter table retention_policies add column if not exists description text;
      create trigger retention_source_guard before insert or update or delete on driver_trips
      for each row execute function safebus_private.retention_source_guard();
      create table tracking_test_signals(id bigint generated always as identity primary key);
      create function tracking_test_signal() returns trigger language plpgsql as
      $$begin insert into tracking_test_signals default values; return new; end$$;
      create trigger tracking_test_signal after insert or update on driver_trip_current_locations
      for each row execute function tracking_test_signal();
      set check_function_bodies=on;
    `);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  } finally {
    await reference.close();
  }
}
export async function installed() {
  const db = await baseline();
  try {
    await db.exec('begin');
    await db.exec(await migration());
    await db.exec('commit');
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
export async function setup(db) {
  const run = await start(db),
    device = await register(db);
  await bind(db, run.trackingToken, device);
  await db.query(
    "update bus_tracking_sessions set started_at=now()-interval '2 hours' where session_token_hash=md5($1)",
    [run.trackingToken],
  );
  await db.query("update driver_trips set started_at=now()-interval '2 hours' where id=$1", [
    run.trip.id,
  ]);
  return { run, device };
}
export const time = async (db, offset = '0 seconds') =>
  (await db.query('select (now()+$1::interval)::text as t', [offset])).rows[0].t;
