import { Fragment } from 'react';
import { divIcon } from 'leaflet';
import { CircleMarker, Marker, Polyline, Popup } from 'react-leaflet';
import type { RouteOverlay } from '@/types/transportation';
import { orderedStopsForDirection, validOverlayStops } from '@/utils/routeDefinition';

export function RouteOverlayLayers({
  overlays,
  guardian = false,
}: {
  overlays: RouteOverlay[];
  guardian?: boolean;
}) {
  return (
    <>
      {overlays.map((overlay, overlayIndex) => {
        const stops = orderedStopsForDirection(
          validOverlayStops(overlay.stops),
          overlay.direction,
        );
        if (stops.length < 2) return null;
        const positions = stops.map(
          (stop) => [stop.latitude, stop.longitude] as [number, number],
        );
        const midpoint = positions[Math.floor((positions.length - 1) / 2)];
        const arrowIcon = divIcon({
          className: '',
          html: `<span aria-hidden="true" style="display:block;color:${overlay.mapColor};font-size:22px;font-weight:900;text-shadow:0 1px 2px white;transform:rotate(${overlay.direction === 'forward' ? '0' : '180'}deg)">➜</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        const key =
          overlay.tripPatternId ??
          `${overlay.studentId ?? 'route'}-${overlay.routeCode}-${overlay.direction}-${overlayIndex}`;

        return (
          <Fragment key={key}>
            <Polyline
              positions={positions}
              pathOptions={{ color: overlay.mapColor, weight: 6, opacity: 0.75 }}
              data-testid={guardian ? 'guardian-route-overlay-line' : 'admin-route-overlay-line'}
            >
              <Popup>
                <strong>{overlay.routeCode}: {overlay.routeName}</strong>
                <br />
                {overlay.tripName} ({overlay.direction === 'forward' ? 'Start → End' : 'End → Start'})
              </Popup>
            </Polyline>
            <Marker position={midpoint} icon={arrowIcon} interactive={false} />
            {stops.map((stop, stopIndex) => {
              const terminal = stopIndex === 0 || stopIndex === stops.length - 1;
              return (
                <CircleMarker
                  key={`${key}-${stop.order}`}
                  center={[stop.latitude, stop.longitude]}
                  radius={terminal ? 8 : 5}
                  pathOptions={{
                    color: overlay.mapColor,
                    fillColor: terminal ? overlay.mapColor : '#ffffff',
                    fillOpacity: 1,
                    weight: terminal ? 3 : 2,
                  }}
                  data-testid={guardian ? 'guardian-route-overlay-stop' : 'admin-route-overlay-stop'}
                >
                  <Popup>
                    <strong>
                      {stopIndex === 0 ? 'Start: ' : stopIndex === stops.length - 1 ? 'End: ' : ''}
                      {stop.name}
                    </strong>
                    {stop.plannedArrivalTime && (
                      <>
                        <br />
                        Planned: {stop.plannedArrivalTime.slice(0, 5)}
                      </>
                    )}
                  </Popup>
                </CircleMarker>
              );
            })}
          </Fragment>
        );
      })}
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
          <span className="h-1 w-7 rounded" style={{ backgroundColor: overlay.mapColor }} />
          <span>{overlay.routeCode} · {overlay.tripName}</span>
        </li>
      ))}
    </ul>
  );
}
