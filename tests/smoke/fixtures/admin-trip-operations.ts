import { type Page } from '@playwright/test';
import { ADMIN_IDS, installAdminWorkflowMock } from './admin-workflow';

export const tripId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function operation(n: number, status = 'completed', date = '2026-10-28') {
  return {
    trip_id: tripId(n),
    service_date: date,
    status,
    started_at: `${date}T14:00:00Z`,
    ended_at: ['active', 'paused'].includes(status) ? null : `${date}T15:00:00Z`,
    route_name: `Route ${n}`,
    route_code: `R${n}`,
    trip_pattern_name: 'School bound',
    direction: status === 'cancelled' ? 'reverse' : 'forward',
    bus_label: '12',
    driver_label: 'Alex Driver',
    location_status: ['active', 'paused'].includes(status) ? 'missing' : 'not_applicable',
    latest_location_at: null,
    eta_label: null,
    next_stop_name: null,
  };
}

export async function installTripOperationsMock(page: Page, time = '2026-10-28T14:01:00Z') {
  await page.clock.install({ time: new Date(time) });
  await installAdminWorkflowMock(page);
  const controls = {
    rows: [
      operation(1, 'active', '2026-10-27'),
      operation(2, 'paused', '2026-10-27'),
      ...Array.from({ length: 225 }, (_, i) => operation(i + 3)),
      operation(230, 'cancelled', '2025-01-14'),
    ],
    requests: [] as Array<Record<string, unknown>>,
    detailRequests: [] as string[],
    tripError: false,
    accessError: false,
    missingRpc: false,
    summaryError: false,
    detailMissing: false,
    mapConfigured: true,
    tileError: false,
    dispatchWrites: 0,
    detailStatus: 'active',
  };
  await page.route('**/.netlify/functions/map-tile-config', (route) =>
    route.fulfill({
      status: controls.mapConfigured ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify({
        tileUrl: 'https://maps.geoapify.com/test/{z}/{x}/{y}.png',
        attribution: 'Test map',
      }),
    }),
  );
  await page.route('https://maps.geoapify.com/**', (route) =>
    controls.tileError
      ? route.abort()
      : route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            'base64',
          ),
        }),
  );
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const send = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/rpc/get_admin_trip_operations')) {
      const args = route.request().postDataJSON();
      controls.requests.push(args);
      if (controls.accessError) return send({ code: '42501' }, 403);
      if (controls.missingRpc) return send({ code: 'PGRST202' }, 404);
      if (controls.tripError) return send({ code: 'XX000' }, 500);
      const rows = controls.rows
        .filter(
          (r) =>
            (!args.p_from_date || r.service_date >= args.p_from_date) &&
            (!args.p_to_date || r.service_date <= args.p_to_date) &&
            (!args.p_status || r.status === args.p_status),
        )
        .sort(
          (a, b) =>
            Number(!['active', 'paused'].includes(a.status)) -
              Number(!['active', 'paused'].includes(b.status)) ||
            b.service_date.localeCompare(a.service_date) ||
            a.trip_id.localeCompare(b.trip_id),
        );
      const offset = (args.p_page - 1) * args.p_page_size;
      return send({ rows: rows.slice(offset, offset + args.p_page_size), totalCount: rows.length });
    }
    if (path.endsWith('/rpc/get_admin_trip_detail')) {
      const requested = route.request().postDataJSON().p_trip_id;
      controls.detailRequests.push(requested);
      if (controls.accessError) return send({ code: '42501' }, 403);
      if (controls.tripError) return send({ code: 'XX000' }, 500);
      if (controls.detailMissing) return send(null);
      const trip = { ...operation(1, controls.detailStatus), trip_id: requested };
      return send({
        trip,
        stops: [
          {
            id: tripId(400),
            name: 'First stop',
            order: 1,
            latitude: 53,
            longitude: -113,
            plannedTime: '08:00:00',
          },
          {
            id: tripId(401),
            name: 'School',
            order: 2,
            latitude: 53.01,
            longitude: -113,
            plannedTime: '08:30:00',
          },
        ],
        shape: {
          geojson: {
            type: 'LineString',
            coordinates: [
              [-113, 53],
              [-113, 53.01],
            ],
          },
          version: 1,
          basis: 'trip',
        },
        location:
          controls.detailStatus === 'active'
            ? {
                latitude: 53.005,
                longitude: -113,
                recordedAt: new Date('2026-10-28T14:01:00Z').toISOString(),
                speedMps: 10,
                accuracyM: 5,
                state: 'live',
              }
            : null,
        students: [
          {
            id: tripId(500),
            name: 'Assigned Student',
            school: 'First School',
            pickupStop: 'First stop',
            dropoffStop: 'School',
            seat: 4,
            hasAssignment: true,
            assignmentStatus: 'active',
            pickedUpAt: null,
            droppedOffAt: null,
          },
          {
            id: tripId(501),
            name: 'Recorded Student',
            school: 'First School',
            pickupStop: null,
            dropoffStop: null,
            seat: null,
            hasAssignment: false,
            assignmentStatus: null,
            pickedUpAt: '2026-10-28T14:00:00Z',
            droppedOffAt: null,
          },
        ],
        mapColor: '#2563eb',
        eta: { label: '5–10 min', nextStop: 'School' },
      });
    }
    if (path.endsWith('/rpc/get_admin_active_trip_operational_statuses'))
      return send([
        {
          trip_id: controls.detailRequests.at(-1) ?? tripId(1),
          bus_label: '12',
          route_name: 'Route 1',
          trip_status: 'active',
          operational_status: 'normal',
          reason_code: null,
        },
      ]);
    if (path.endsWith('/rpc/set_trip_operational_status')) {
      controls.dispatchWrites++;
      return send(null);
    }
    if (route.request().method() === 'HEAD' && path.endsWith('/buses') && controls.summaryError)
      return route.fulfill({ status: 500, body: '' });
    if (path.endsWith('/pre_trip_confirmations')) return send(null);
    if (path.endsWith('/trip_exceptions') || path.endsWith('/operational_notes')) return send([]);
    return route.fallback();
  });
  return controls;
}

export { ADMIN_IDS };
