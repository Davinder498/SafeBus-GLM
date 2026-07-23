import { Polyline, Popup } from 'react-leaflet';
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
    <>
      {overlays.map((overlay) => {
        const positions = overlay.routeShapeGeojson?.coordinates
          ?.filter(([longitude, latitude]) => Number.isFinite(latitude) && Number.isFinite(longitude))
          .map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
        if (!positions || positions.length < 2) return null;
        return (
          <Polyline
            key={`${overlay.routeId ?? overlay.routeCode}-${overlay.tripPatternId ?? overlay.tripName}-shape`}
            positions={positions}
            pathOptions={{ color: overlay.mapColor, opacity: guardian ? 0.35 : 0.65, weight: guardian ? 4 : 5 }}
            data-testid={guardian ? 'guardian-route-shape-line' : 'admin-route-shape-line'}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{overlay.routeCode} · planned route</p>
                {overlay.routeShapeVersion && <p>Shape version {overlay.routeShapeVersion}</p>}
                {overlay.routeShapeDistanceMeters && <p>{(overlay.routeShapeDistanceMeters / 1000).toFixed(2)} km planned</p>}
              </div>
            </Popup>
          </Polyline>
        );
      })}
      <NumberedRouteStopMarkers
      entries={buildOverlayRouteStopMarkerEntries(overlays)}
      paneName={guardian ? 'guardian-route-stops' : 'admin-live-route-stops'}
      testId={guardian ? 'guardian-route-overlay-stop' : 'admin-route-overlay-stop'}
      density={guardian ? 'comfortable' : 'compact'}
      />
    </>
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
          <span>{overlay.routeCode} · {overlay.tripName}{overlay.routeShapeVersion ? ` · shape v${overlay.routeShapeVersion}` : ''}</span>
        </li>
      ))}
    </ul>
  );
}
