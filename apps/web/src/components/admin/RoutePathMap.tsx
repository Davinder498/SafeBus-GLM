import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { divIcon } from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { MapTileConfig } from '@/config/mapTiles';
import type { Route, RouteStop, RouteShapeGeoJson } from '@/types/transportation';
import { NumberedRouteStopMarkers } from '@/components/maps/NumberedRouteStopMarkers';
import { buildCanonicalRouteStopMarkerEntries } from '@/utils/routeStopMarkers';

type Points = RouteShapeGeoJson['coordinates'];

class MapBoundary extends Component<
  { children: ReactNode; onFailure(): void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFailure();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function DrawingEvents({
  enabled,
  onAdd,
}: {
  enabled: boolean;
  onAdd(point: [number, number]): void;
}) {
  useMapEvents({
    click(event) {
      if (enabled) onAdd([event.latlng.lng, event.latlng.lat]);
    },
  });
  return null;
}

function FitPath({ points, request }: { points: [number, number][]; request: number }) {
  const map = useMap();
  const lastRequest = useRef(-1);
  useEffect(() => {
    if (request === lastRequest.current || points.length === 0) return;
    lastRequest.current = request;
    map.fitBounds(points, { padding: [36, 36], maxZoom: 16 });
  }, [map, points, request]);
  return null;
}

export function RoutePathMap({
  route,
  stops,
  points,
  tileConfig,
  drawing,
  editable,
  fitRequest,
  onChange,
  onFailure,
}: {
  route: Route;
  stops: RouteStop[];
  points: Points;
  tileConfig: MapTileConfig;
  drawing: boolean;
  editable: boolean;
  fitRequest: number;
  onChange(points: Points): void;
  onFailure(): void;
}) {
  const entries = useMemo(
    () => buildCanonicalRouteStopMarkerEntries([{ route, stops }]),
    [route, stops],
  );
  const pathPositions = points.map(([lng, lat]) => [lat, lng] as [number, number]);
  const allPositions = [
    ...pathPositions,
    ...entries.map((stop) => [stop.latitude, stop.longitude] as [number, number]),
  ];
  const center = allPositions[0] ?? [51.0447, -114.0719];
  const vertexIcon = useMemo(
    () =>
      divIcon({
        className: '',
        html: '<span style="display:block;width:14px;height:14px;border:2px solid white;border-radius:50%;background:#235c78;box-shadow:0 0 0 2px #235c78"></span>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    [],
  );
  return (
    <MapBoundary onFailure={onFailure}>
      <section
        className="relative z-0 h-96 overflow-hidden rounded-xl border border-navy-200"
        aria-label="Route road path preview"
        data-testid="route-path-map"
      >
        <MapContainer center={center} zoom={13} doubleClickZoom={false} className="h-full w-full">
          {tileConfig.tileUrl && tileConfig.attribution && (
            <TileLayer
              url={tileConfig.tileUrl}
              attribution={tileConfig.attribution}
              referrerPolicy="strict-origin"
              eventHandlers={{ tileerror: onFailure }}
            />
          )}
          <FitPath points={allPositions} request={fitRequest} />
          <DrawingEvents
            enabled={drawing && editable}
            onAdd={(point) => onChange([...points, point])}
          />
          {pathPositions.length >= 2 && (
            <Polyline positions={pathPositions} pathOptions={{ color: '#235c78', weight: 5 }} />
          )}
          {points.map(([lng, lat], index) => (
            <Marker
              key={index}
              position={[lat, lng]}
              icon={vertexIcon}
              draggable={editable}
              title={`Path point ${index + 1}`}
              eventHandlers={{
                dragend(event) {
                  const next = event.target.getLatLng() as { lng: number; lat: number };
                  onChange(points.map((point, i) => (i === index ? [next.lng, next.lat] : point)));
                },
              }}
            />
          ))}
          <NumberedRouteStopMarkers
            entries={entries}
            paneName="route-path-stops"
            testId="route-path-stop"
            density="comfortable"
          />
        </MapContainer>
      </section>
    </MapBoundary>
  );
}
