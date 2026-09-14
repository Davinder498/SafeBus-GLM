import type { GuardianBusServiceStop } from '@/types/guardianLiveBusLocation';

interface LocalPoint {
  x: number;
  y: number;
  stopIndex: number;
}

function hasCoordinates(
  stop: GuardianBusServiceStop,
): stop is GuardianBusServiceStop & { latitude: number; longitude: number } {
  return (
    stop.latitude !== null &&
    stop.longitude !== null &&
    Number.isFinite(stop.latitude) &&
    Number.isFinite(stop.longitude)
  );
}

/**
 * Projects the current bus coordinate onto the ordered stop segments and
 * returns its position on the schematic line. Stop spacing remains uniform for
 * readability, while the nearest geographic segment determines the marker.
 */
export function calculateGuardianBusProgress(
  stops: GuardianBusServiceStop[],
  latitude: number | null,
  longitude: number | null,
): number | null {
  if (
    stops.length < 2 ||
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const locatedStops = stops.filter(hasCoordinates);
  if (locatedStops.length < 2) return null;

  const originLatitude = (locatedStops[0].latitude * Math.PI) / 180;
  const longitudeScale = Math.cos(originLatitude);
  const points: LocalPoint[] = stops.flatMap((stop, stopIndex) =>
    hasCoordinates(stop)
      ? [
          {
            x: stop.longitude * longitudeScale,
            y: stop.latitude,
            stopIndex,
          },
        ]
      : [],
  );
  const bus = { x: longitude * longitudeScale, y: latitude };

  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  let closestDisplayPosition = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (segmentLengthSquared === 0) continue;

    const rawFraction =
      ((bus.x - start.x) * segmentX + (bus.y - start.y) * segmentY) /
      segmentLengthSquared;
    const fraction = Math.min(1, Math.max(0, rawFraction));
    const projectedX = start.x + segmentX * fraction;
    const projectedY = start.y + segmentY * fraction;
    const distanceX = bus.x - projectedX;
    const distanceY = bus.y - projectedY;
    const distanceSquared = distanceX * distanceX + distanceY * distanceY;

    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared;
      closestDisplayPosition =
        start.stopIndex + (end.stopIndex - start.stopIndex) * fraction;
    }
  }

  if (!Number.isFinite(closestDistanceSquared)) return null;
  return Math.min(100, Math.max(0, (closestDisplayPosition / (stops.length - 1)) * 100));
}
