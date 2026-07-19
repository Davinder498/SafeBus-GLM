import { NumberedRouteStopMarkers } from '@/components/maps/NumberedRouteStopMarkers';
import type { RouteOverlay } from '@/types/transportation';
import { buildOverlayRouteStopMarkerEntries } from '@/utils/routeStopMarkers';

export function RouteOverlayLayers({
  overlays,
  guardian = false,
}: {
  overlays: RouteOverlay[];
  guardian?: boolean;
}) {
  return (
    <NumberedRouteStopMarkers
      entries={buildOverlayRouteStopMarkerEntries(overlays)}
      paneName={guardian ? 'guardian-route-stops' : 'admin-live-route-stops'}
      testId={guardian ? 'guardian-route-overlay-stop' : 'admin-route-overlay-stop'}
      density={guardian ? 'comfortable' : 'compact'}
    />
  );
}

export function RouteOverlayLegend({ overlays }: { overlays: RouteOverlay[] }) {
  const unique = Array.from(
    new Map(
      overlays.map((overlay) => [
        `${overlay.routeCode}-${overlay.tripName}`,
        overlay,
      ]),
    ).values(),
  );
  if (unique.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-3 text-xs text-gray-700" aria-label="Route map legend">
      {unique.map((overlay) => (
        <li key={`${overlay.routeCode}-${overlay.tripName}`} className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full border-2 border-white shadow-sm"
            style={{ backgroundColor: overlay.mapColor }}
            aria-hidden="true"
          />
          <span>{overlay.routeCode} · {overlay.tripName}</span>
        </li>
      ))}
    </ul>
  );
}
