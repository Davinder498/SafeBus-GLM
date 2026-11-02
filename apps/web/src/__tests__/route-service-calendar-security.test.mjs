// @vitest-environment node
// Exact inspected policies/helpers; synthetic embedded database and no providers.
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, it, expect } from 'vitest';
import {
  routeCalendarDb,
  calendarMigration,
  id,
} from '../../../../tests/release/fixtures/route-calendar-db.mjs';
import {
  operationalSnapshot,
  verifyOperationalSnapshot,
  rehearseOperational,
  operationalDigest,
} from '../../../../scripts/lib/operational-rollout.mjs';
let db, sql, config;
beforeAll(async () => {
  db = await routeCalendarDb({ security: true });
  sql = await calendarMigration();
  config = JSON.parse(await readFile('../../config/pending/route-service-calendar.json', 'utf8'));
}, 60000);
afterAll(async () => db?.close());
const client = {
  query: async (sql, args) => (args ? db.query(sql, args) : (await db.exec(sql)).at(-1)),
};
async function isolated(run) {
  await db.exec('begin');
  try {
    await db.exec(sql);
    await run();
  } finally {
    await db.exec('rollback');
  }
}
async function claims(role = 'tenant_admin', aal = 'aal2', tenant = 1) {
  await db.exec('reset role');
  await db.query('update profiles set role=$1,tenant_id=$2 where id=$3', [role, id(tenant), id(2)]);
  await db.query(
    "select set_config('test.uid',$1,false),set_config('test.aal',$2,false),set_config('test.active','true',false)",
    [id(2), aal],
  );
}
async function request(run) {
  await db.exec(
    "savepoint request;set local role authenticated;select set_config('request.path','rpc/admin_save_route_definition',false),set_config('request.method','POST',false)",
  );
  try {
    await db.exec('select safebus_private.enforce_active_api_session()');
    return await run();
  } finally {
    await db.exec('rollback to savepoint request;release savepoint request');
  }
}
const route = {
  routeName: 'Weekend service',
  routeCode: 'WKND',
  routeKind: 'regular',
  status: 'inactive',
  serviceMode: 'dates',
  serviceDays: [],
  serviceDates: ['2026-11-08', '2026-11-01', '2026-11-08'],
};
const save = (
  calendar = {},
  stops = [],
  patterns = ['forward', 'reverse'].map((direction) => ({
    direction,
    displayName: direction,
    status: 'active',
    stopTimes: {},
  })),
) =>
  db.query('select public.admin_save_route_definition($1,$2,$3) result', [
    { ...route, ...calendar },
    stops,
    patterns,
  ]);
it('rehearses installation and full recovery with exact catalog, ACL, trigger and constraint drift guards', async () => {
  expect(operationalDigest(sql)).toBe(config.migrationSha256);
  const before = await operationalSnapshot(client, config);
  expect(verifyOperationalSnapshot(before, config, 'before').functionsVerified).toBe(9);
  expect((await rehearseOperational(client, sql, config)).functionsVerified).toBe(9);
  expect(await operationalSnapshot(client, config)).toEqual(before);
}, 30000);
it('saves calendar and all seven weekday flags atomically with the route', () =>
  isolated(async () => {
    await claims();
    await db.exec('set local role authenticated');
    const result = (await save()).rows[0].result;
    const saved = (
      await db.query(
        'select service_schedule_mode,to_jsonb(service_dates) service_dates from routes where id=$1',
        [result.routeId],
      )
    ).rows[0];
    expect(saved).toEqual({
      service_schedule_mode: 'dates',
      service_dates: ['2026-11-01', '2026-11-08'],
    });
    expect(
      (
        await db.query('select status from route_service_days where route_id=$1', [result.routeId])
      ).rows.map((d) => d.status),
    ).toEqual(Array(7).fill('inactive'));
  }));
it('rolls back calendar and route changes when later stop validation fails', () =>
  isolated(async () => {
    await claims();
    const before = (await db.query('select count(*)::int n from routes')).rows[0].n;
    await expect(
      request(() => save({}, [{ clientKey: 'bad', stopName: '', stopOrder: 1 }])),
    ).rejects.toMatchObject({ code: '22023' });
    expect((await db.query('select count(*)::int n from routes')).rows[0].n).toBe(before);
    expect((await db.query('select count(*)::int n from route_service_days')).rows[0].n).toBe(0);
  }));
it.each([
  { serviceDates: ['11/08/2026'] },
  { serviceDates: [null] },
  { serviceDates: Array(367).fill('2026-11-08') },
  { serviceDays: [7] },
  { serviceDays: [null] },
  { serviceDays: Array(8).fill(1) },
  { serviceMode: 'unknown' },
  { status: 'active', serviceDates: [] },
])('rejects malformed or unbounded calendars %#', (calendar) =>
  isolated(async () => {
    await claims();
    await expect(request(() => save(calendar))).rejects.toMatchObject({ code: '22023' });
  }),
);
it.each(['transportation_admin', 'school_admin', 'driver', 'guardian', 'platform_super_admin'])(
  'does not grant route/calendar definition mutation to %s',
  (role) =>
    isolated(async () => {
      await claims(role);
      await expect(request(() => save())).rejects.toMatchObject({ code: '42501' });
    }),
);
it.each(['tenant_admin', 'transportation_admin'])(
  'keeps %s reads within its authority and requires MFA/session/account status',
  (role) =>
    isolated(async () => {
      await claims(role);
      expect((await request(() => db.query('select id from routes'))).rows).toHaveLength(1);
      await claims(role, 'aal2', 90);
      expect((await request(() => db.query('select id from routes'))).rows).toHaveLength(0);
      await claims(role, 'aal1');
      await expect(request(() => db.query('select id from routes'))).rejects.toMatchObject({
        code: '42501',
      });
      await claims(role);
      await db.exec("select set_config('test.active','false',false)");
      await expect(request(() => save())).rejects.toMatchObject({ code: '42501' });
      await claims(role);
      await db.exec(`update profiles set status='suspended' where id='${id(2)}'`);
      expect((await request(() => db.query('select id from routes'))).rows).toHaveLength(0);
    }),
);
it('rejects editing a foreign route and leaves its calendar unchanged', () =>
  isolated(async () => {
    await claims('tenant_admin', 'aal2', 90);
    await expect(request(() => save({ id: id(21) }))).rejects.toMatchObject({ code: 'P0002' });
    expect(
      (await db.query('select service_schedule_mode from routes where id=$1', [id(21)])).rows[0]
        .service_schedule_mode,
    ).toBe('weekly');
  }));
it.each(['school_admin', 'guardian', 'platform_super_admin'])(
  'does not expose route calendars to %s',
  (role) =>
    isolated(async () => {
      await claims(role);
      expect((await request(() => db.query('select id from routes'))).rows).toHaveLength(0);
    }),
);
