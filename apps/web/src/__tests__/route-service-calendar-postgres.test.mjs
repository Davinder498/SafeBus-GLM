// @vitest-environment node
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import {
  routeCalendarDb,
  calendarMigration,
  id,
} from '../../../../tests/release/fixtures/route-calendar-db.mjs';
let db;
beforeAll(async () => {
  db = await routeCalendarDb();
  await db.exec(await calendarMigration());
}, 60000);
afterAll(async () => {
  await db?.close();
});
async function isolated(at, run) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(at));
  await db.exec('begin');
  try {
    await db.exec(
      `update bus_route_assignments set effective_from='2020-01-01',effective_to='2030-12-31';select set_config('test.uid','${id(3)}',false);`,
    );
    await run();
  } finally {
    await db.exec('rollback');
    vi.useRealTimers();
  }
}
async function denied(action, code) {
  await db.exec('savepoint rejection');
  await expect(action()).rejects.toMatchObject({ code });
  await db.exec('rollback to savepoint rejection; release savepoint rejection');
}
const token = 'sbus_bus_v1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const options = () => db.query(`select * from public.get_bus_qr_start_options('${token}')`);
const start = () =>
  db.query(`select public.start_bus_tracking_from_qr('${token}',$1) as result`, [id(23)]);
it(
  'compiles the inspected functions and refuses new weekly trips on closed Sundays',
  () =>
    isolated('2026-11-01T18:00:00Z', async () => {
      await db.exec(
        `insert into route_service_days(tenant_id,route_id,day_of_week,status) select '${id(1)}','${id(21)}',n,case when n between 1 and 5 then 'active' else 'inactive' end from generate_series(0,6)n;`,
      );
      expect((await options()).rows).toHaveLength(0);
      await denied(start, '55006');
    }),
  30000,
);
it(
  'starts on an open weekday and preserves an ongoing run after the calendar closes',
  () =>
    isolated('2026-11-02T18:00:00Z', async () => {
      await db.exec(
        `insert into route_service_days(tenant_id,route_id,day_of_week,status) values('${id(1)}','${id(21)}',1,'active');`,
      );
      expect((await options()).rows).toHaveLength(1);
      const trip = (await start()).rows[0].result.trip;
      await db.exec("update route_service_days set status='inactive'");
      expect((await options()).rows[0].resumed).toBe(true);
      expect((await start()).rows[0].result.trip.id).toBe(trip.id);
    }),
  30000,
);
it.each(['regular', 'field_trip'])(
  'allows specific Sunday dates for %s and rejects the next day',
  (kind) =>
    isolated('2026-11-01T18:00:00Z', async () => {
      await db.query(
        "update routes set route_kind=$1,service_schedule_mode='dates',service_dates=array['2026-11-01'::date,'2026-11-08'::date]",
        [kind],
      );
      expect((await options()).rows).toHaveLength(1);
      expect((await start()).rows[0].result.trip.service_date).toBe('2026-11-01');
    }),
  30000,
);
it(
  'rejects unlisted dates, including direct trip inserts and stale selected options',
  () =>
    isolated('2026-11-02T18:00:00Z', async () => {
      expect((await options()).rows).toHaveLength(1);
      await db.exec(
        "update routes set service_schedule_mode='dates',service_dates=array['2026-11-08'::date]",
      );
      await denied(start, '55006');
      await denied(
        () =>
          db.exec(
            `insert into driver_trips(tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id) values('${id(1)}','${id(13)}','${id(20)}','${id(21)}','${id(22)}')`,
          ),
        '55006',
      );
    }),
  30000,
);
it.each([
  ['2026-01-09T06:30:00Z', '2026-01-08'],
  ['2026-07-09T05:59:59Z', '2026-07-08'],
  ['2026-11-02T05:59:59Z', '2026-11-01'],
  ['2026-11-02T06:00:00Z', '2026-11-02'],
])(
  'uses pinned Alberta calendar dates at %s',
  (at, day) =>
    isolated(at, async () => {
      expect(
        (await db.query('select safebus_private.route_calendar_today()::text as day')).rows[0].day,
      ).toBe(day);
      expect((await start()).rows[0].result.trip.service_date).toBe(day);
    }),
  30000,
);
it(
  'does not expose other authorities or give non-drivers QR-start access',
  () =>
    isolated('2026-11-02T18:00:00Z', async () => {
      await db.exec(`select set_config('test.uid','${id(2)}',false)`);
      await denied(options, '42501');
      await denied(start, '42501');
      await db.exec(
        `select set_config('test.uid','${id(3)}',false);update bus_qr_credentials set tenant_id='${id(90)}'`,
      );
      await denied(options, 'P0002');
    }),
  30000,
);
