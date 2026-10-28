// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  operationalSnapshot,
  operationalRestoreSql,
  verifyOperationalSnapshot,
  rehearseOperational,
} from '../../../../scripts/lib/operational-rollout.mjs';
import {
  dateBaseline,
  searchBaseline,
  serviceDateDb,
  serviceDateMigration,
  id,
} from '../../../../tests/release/fixtures/service-dates-db.mjs';

let db;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const isolated = async (run, at = '2026-10-28T00:39:47Z') => {
  // PGlite's WASM clock reads JavaScript Date. Freeze it before BEGIN so
  // PostgreSQL's real transaction timestamp and CURRENT_DATE use this instant.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(at));
  await db.exec('begin');
  try {
    await run();
  } finally {
    await db.exec('rollback');
    vi.useRealTimers();
  }
};
beforeAll(async () => {
  db = await serviceDateDb();
}, 60_000);
afterAll(async () => db?.close());

it('rehearses with body checking, restores the exact catalog, and rejects altered ACLs or partial adoption', async () => {
  const config = JSON.parse(
    await readFile('../../config/pending/admin-active-trip-visibility.json', 'utf8'),
  );
  const client = { query: (sql, params) => params ? db.query(sql,params) : db.exec(sql).then(results => results.at(-1)) };
  const before = await operationalSnapshot(client, config);
  await rehearseOperational(client, await serviceDateMigration(), config);
  expect(await operationalSnapshot(db, config)).toEqual(before);
  await db.exec('begin');
  try {
    await db.exec(await serviceDateMigration());
    expect(
      verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'after')
        .functionsVerified,
    ).toBe(29);
    await db.exec(operationalRestoreSql(before, config));
    expect(await operationalSnapshot(db, config)).toEqual(before);
    await db.exec('grant execute on function safebus_private.prepare_bus_run(uuid) to anon');
    expect(() => verifyOperationalSnapshot(before, config, 'after')).toThrow();
    const drifted = await operationalSnapshot(db, config);
    expect(() => verifyOperationalSnapshot(drifted, config, 'before')).toThrow(
      'OPERATIONAL_FUNCTION_DRIFT',
    );
  } finally {
    await db.exec('rollback');
  }
}, 30_000);

it(
  'compiles the exact date migration against the hosted function baselines and retains ACLs',
  () =>
    isolated(async () => {
      const baseline = await dateBaseline();
      await db.exec(await serviceDateMigration());
      for (const f of [...baseline.functions, await searchBaseline()]) {
        const [actual] = await rows(
          `select prosrc,prosecdef,proconfig,coalesce(proacl,acldefault('f',proowner))::text[] as acl from pg_proc where oid=to_regprocedure($1)`,
          [f.signature],
        );
        expect(actual.acl.sort()).toEqual(f.acl.sort());
        expect(actual.prosrc).not.toMatch(/\bcurrent_date\b/i);
      }
    }),
  30_000,
);

it.each([
  ['2026-10-28T00:39:47Z', '2026-10-27'],
  ['2026-03-08T06:59:59Z', '2026-03-07'],
  ['2026-03-08T07:00:00Z', '2026-03-08'],
  ['2026-03-08T09:00:00Z', '2026-03-08'],
  ['2026-11-01T05:59:59Z', '2026-10-31'],
  ['2026-11-01T06:00:00Z', '2026-11-01'],
  ['2026-11-01T08:00:00Z', '2026-11-01'],
])(
  'dates QR-started trips, prepared runs, and assignment defaults consistently at %s',
  (at, date) =>
    isolated(async () => {
      await db.exec(await serviceDateMigration());
      await db.query('update bus_route_assignments set effective_from=$1,effective_to=$1', [date]);
      const [dispatch] = await rows(
        `select service_date::text from safebus_private.prepare_bus_run($1)`,
        [id(23)],
      );
      expect(dispatch.service_date).toBe(date);
      await db.query("select set_config('test.uid',$1,false)", [id(3)]);
      const [started] = await rows(
        `select public.start_bus_tracking_from_qr('sbus_bus_v1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',$1) as result`,
        [id(23)],
      );
      expect(started.result.trip.service_date).toBe(date);
      const [defaults] = await rows(
        'insert into student_route_assignments default values returning effective_from::text',
      );
      expect(defaults.effective_from).toBe(date);
    }, at),
  30_000,
);

it.each([
  ['2026-10-28T00:39:47Z', 1],
  ['2026-10-28T06:00:00Z', 0],
])(
  'keeps driver and linked guardian eligibility aligned at %s',
  (at, count) =>
    isolated(async () => {
      await db.exec(await serviceDateMigration());
      await db.query("select set_config('test.uid',$1,false)", [id(3)]);
      expect(
        await rows('select * from safebus_private.get_current_driver_trip_assignments()'),
      ).toHaveLength(count);
      expect(
        (
          await rows('select safebus_private.driver_can_read_assigned_route($1,$2) as allowed', [
            id(1),
            id(21),
          ])
        )[0].allowed,
      ).toBe(!!count);
      await db.exec('set local role authenticated');
      expect(await rows('select * from buses')).toHaveLength(count);
      await db.exec('reset role');
      await db.query("select set_config('test.uid',$1,false)", [id(4)]);
      const stops = await rows('select * from public.get_guardian_student_stops_v2()');
      expect(stops.map((x) => x.student_id)).toEqual(count ? [id(30)] : []);
      await db.query("select set_config('test.uid',$1,false)", [id(3)]);
      if (!count)
        await expect(
          rows(
            `select public.start_bus_tracking_from_qr('sbus_bus_v1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',$1)`,
            [id(23)],
          ),
        ).rejects.toMatchObject({ code: '55006' });
    }, at),
  30_000,
);

it(
  'returns ongoing active and paused runs across service dates with exact pagination, school scope and role rejection',
  () =>
    isolated(async () => {
      await db.exec(await serviceDateMigration());
      await db.exec(`create policy test_admin_buses on buses for select to authenticated using(safebus_private.current_user_role() in ('tenant_admin','school_admin','transportation_admin') and tenant_id=safebus_private.current_tenant_id());
    insert into driver_trips(tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id,status,service_date,started_at)
      select '${id(1)}','${id(13)}','${id(20)}','${id(21)}','${id(22)}',case when n%2=0 then 'paused' else 'active' end,'2026-10-26',now() from generate_series(1,26) n;
    insert into driver_trips(tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id,status,service_date,started_at)
      values('${id(1)}','${id(13)}','${id(20)}','${id(21)}','${id(22)}','completed','2026-10-27',now());
    set local role authenticated;`);
      const query = async (page = 1) =>
        (
          await rows("select public.search_admin_trips(null,null,'ongoing',$1,25) as result", [
            page,
          ])
        )[0].result;
      expect(await query()).toMatchObject({ totalCount: 26 });
      expect((await query()).rows).toHaveLength(25);
      expect((await query(2)).rows).toHaveLength(1);
      for (const role of ['school_admin', 'transportation_admin']) {
        await db.exec('reset role');
        await db.query('update profiles set role=$1::user_role where id=$2', [role, id(2)]);
        await db.exec('set local role authenticated');
        expect((await query()).totalCount).toBe(26);
      }
      await db.exec('reset role');
      await db.query('update profiles set school_id=$1 where id=$2', [id(81), id(2)]);
      await db.query("update profiles set role='school_admin' where id=$1", [id(2)]);
      await db.exec('set local role authenticated');
      expect((await query()).totalCount).toBe(0);
      for (const role of ['guardian', 'driver', 'platform_super_admin']) {
        await db.exec('reset role');
        await db.query('update profiles set role=$1::user_role where id=$2', [role, id(2)]);
        await db.exec('set local role authenticated');
        await db.exec('savepoint denied');
        await expect(query()).rejects.toMatchObject({ code: '42501' });
        await db.exec('rollback to savepoint denied');
      }
    }),
  30_000,
);
