import { describe, it, expect } from 'vitest';
import type { AdminTripDetail } from '@/types/adminTripDetail';
import { tripStopPosition, verifiedTripLocation } from './adminTripPresentation';
import { readTripListQuery } from './adminTripListQuery';

const now = Date.parse('2026-10-28T14:00:00Z');
const detail: AdminTripDetail = {
  trip: {
    id: 'trip',
    status: 'active',
    serviceDate: '2026-10-28',
    startedAt: '2026-10-28T13:00:00Z',
    endedAt: null,
    routeName: 'R1',
    routeCode: 'R1',
    tripPatternName: 'Outbound',
    direction: 'outbound',
    busLabel: '01',
    driverLabel: 'Driver',
  },
  stops: [
    { id: 'a', name: 'Start', order: 1, latitude: 53, longitude: -113, plannedTime: null },
    { id: 'b', name: 'School', order: 2, latitude: 53.01, longitude: -113, plannedTime: null },
  ],
  location: {
    latitude: 53.005,
    longitude: -113,
    recordedAt: new Date(now).toISOString(),
    speedMps: 10,
    accuracyM: 5,
    state: 'live',
  },
  students: [],
  shape: null,
  mapColor: null,
  eta: null,
};

describe('trip telemetry and service-line evidence', () => {
  it('hides offline, expired, invalid and ended-trip markers', () => {
    expect(verifiedTripLocation(detail, now, true, now)).toEqual(detail.location);
    expect(verifiedTripLocation(detail, now, false, now)).toBeNull();
    expect(verifiedTripLocation(detail, now, true, now + 121000)).toBeNull();
    expect(
      verifiedTripLocation(
        { ...detail, trip: { ...detail.trip, status: 'completed' } },
        now,
        true,
        now,
      ),
    ).toBeNull();
    expect(
      verifiedTripLocation(
        { ...detail, location: { ...detail.location!, recordedAt: 'bad' } },
        now,
        true,
        now,
      ),
    ).toBeNull();
    expect(
      verifiedTripLocation(
        { ...detail, location: { ...detail.location!, latitude: 100 } },
        now,
        true,
        now,
      ),
    ).toBeNull();
  });
  it('projects in travel order and rejects locations away from the service path', () => {
    expect(tripStopPosition(detail, detail.location)).toBeCloseTo(0.5);
    expect(
      tripStopPosition({ ...detail, stops: [...detail.stops].reverse() }, detail.location),
    ).toBeCloseTo(0.5);
    expect(tripStopPosition(detail, { ...detail.location!, longitude: -114 })).toBeNull();
  });
  it('uses saved curved road geometry and rejects ambiguous stop anchors', () => {
    const shaped: AdminTripDetail = {
      ...detail,
      shape: {
        geojson: {
          type: 'LineString',
          coordinates: [
            [-113, 53],
            [-113.01, 53],
            [-113.01, 53.01],
            [-113, 53.01],
          ],
        },
        version: 1,
        basis: 'trip',
      },
    };
    expect(tripStopPosition(shaped, { ...detail.location!, longitude: -113.01 })).toBeCloseTo(0.5);
    expect(
      tripStopPosition({ ...shaped, stops: [detail.stops[0], detail.stops[0]] }, detail.location),
    ).toBeNull();
  });
});

it('restores list filters/pages and rejects malformed URL state', () => {
  expect(readTripListQuery(new URLSearchParams()).query).toMatchObject({
    fromDate: null,
    toDate: null,
    page: 1,
    pageSize: 25,
  });
  expect(
    readTripListQuery(
      new URLSearchParams(
        'tripMode=range&tripFrom=2026-01-01&tripTo=2026-01-31&tripPage=2&tripSize=100&tripStatus=paused',
      ),
    ).query,
  ).toEqual({
    fromDate: '2026-01-01',
    toDate: '2026-01-31',
    page: 2,
    pageSize: 100,
    status: 'paused',
  });
  expect(
    readTripListQuery(new URLSearchParams('tripPage=-1&tripSize=999&tripStatus=other')).query,
  ).toMatchObject({ page: 1, pageSize: 25, status: null });
});
