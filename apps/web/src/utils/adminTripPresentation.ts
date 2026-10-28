import type { AdminTripDetail, AdminTripOperation } from '@/types/adminTripDetail';

export function tripLocationLabel(status: AdminTripOperation['locationStatus']): string {
  return {
    live: 'Live',
    stale: 'Stale GPS',
    missing: 'Missing GPS',
    invalid: 'Unverified GPS',
    not_applicable: '—',
  }[status];
}

export function verifiedTripLocation(
  detail: AdminTripDetail,
  checkedAt: number,
  online: boolean,
  now = Date.now(),
) {
  const loc = detail.location;
  if (
    !online ||
    !['active', 'paused'].includes(detail.trip.status) ||
    !loc ||
    loc.state !== 'live' ||
    !Number.isFinite(Date.parse(loc.recordedAt)) ||
    now - checkedAt > 120_000 ||
    now < checkedAt ||
    now - Date.parse(loc.recordedAt) > 120_000 ||
    Date.parse(loc.recordedAt) - now > 30_000 ||
    !Number.isFinite(loc.latitude) ||
    Math.abs(loc.latitude) > 90 ||
    !Number.isFinite(loc.longitude) ||
    Math.abs(loc.longitude) > 180
  )
    return null;
  return loc;
}

/** Estimated position on the ordered stops, only within 150 m of their path.
 * Never treat GPS proximity as a student's boarding event or a confirmed stop visit.
 */
export function tripStopPosition(
  detail: AdminTripDetail,
  location: AdminTripDetail['location'],
): number | null {
  if (!location || detail.trip.status !== 'active' || detail.stops.length < 2) return null;
  const scale = Math.cos((location.latitude * Math.PI) / 180);
  const point = (lat: number, lng: number): [number, number] => [
    lng * scale * 111_320,
    lat * 111_320,
  ];
  if (detail.stops.some((s) => s.latitude === null || s.longitude === null)) return null;
  const stopPoints = detail.stops.map((s) => point(s.latitude!, s.longitude!));
  const shape = detail.shape?.geojson?.coordinates;
  const path = shape && shape.length > 1 ? shape.map(([lng, lat]) => point(lat, lng)) : stopPoints;
  if (path.some((p) => p.some((v) => !Number.isFinite(v)))) return null;
  function project([px, py]: [number, number]) {
    let nearest = Infinity,
      distanceAlong = 0,
      offset = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i],
        [bx, by] = path[i + 1];
      const length = Math.hypot(bx - ax, by - ay);
      if (!length) continue;
      const t = Math.max(
        0,
        Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (length * length)),
      );
      const distance = Math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay));
      if (distance < nearest) {
        nearest = distance;
        distanceAlong = offset + t * length;
      }
      offset += length;
    }
    return nearest <= 150 ? distanceAlong : null;
  }
  const bus = project(point(location.latitude, location.longitude));
  const anchors = stopPoints.map(project);
  if (bus === null || anchors.some((a) => a === null)) return null;
  const values = anchors as number[];
  const sign = values.at(-1)! > values[0] ? 1 : -1;
  // Crossing or repeated anchors cannot establish a trustworthy travel order.
  if (values.some((v, i) => i > 0 && sign * (v - values[i - 1]) <= 0)) return null;
  const travel = bus * sign;
  if (travel <= values[0] * sign) return 0;
  for (let i = 1; i < values.length; i++) {
    if (travel <= values[i] * sign)
      return i - 1 + (bus - values[i - 1]) / (values[i] - values[i - 1]);
  }
  return values.length - 1;
}
