import { Component, type ErrorInfo, type ReactNode, useCallback, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  useMap,
} from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { NumberedRouteStopMarkers } from '@/components/maps/NumberedRouteStopMarkers';
import type { MapTileConfig } from '@/config/mapTiles';
import type { Route, RouteStop } from '@/types/transportation';
import { buildCanonicalRouteStopMarkerEntries } from '@/utils/routeStopMarkers';

export interface RouteMapRoute {
  route: Route;
  stops: RouteStop[];
}

interface RouteMapLocation {
  position: LatLngExpression;
}

function hasValidCoordinates(stop: RouteStop): boolean {
  return (
    typeof stop.latitude === 'number' &&
    typeof stop.longitude === 'number' &&
    Number.isFinite(stop.latitude) &&
    Number.isFinite(stop.longitude)
  );
}

function toLocations(routes: RouteMapRoute[]): RouteMapLocation[] {
  const locations: RouteMapLocation[] = [];
  for (const entry of routes) {
    const sorted = [...entry.stops]
      .filter((s) => s.status !== 'archived' && hasValidCoordinates(s))
      .sort((a, b) => a.stop_order - b.stop_order);
    for (const stop of sorted) {
      locations.push({
        position: [stop.latitude as number, stop.longitude as number],
      });
    }
  }
  return locations;
}

function FitRoutesControl({
  bounds,
  disabled,
}: {
  bounds: LatLngBoundsExpression | null;
  disabled: boolean;
}) {
  const map = useMap();
  const fitRoutes = useCallback(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
  }, [bounds, map]);

  return (
    <div className="leaflet-top leaflet-right">
      <div className="leaflet-control m-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={fitRoutes}
          disabled={disabled}
          data-testid="admin-routes-map-fit"
        >
          Fit routes
        </Button>
      </div>
    </div>
  );
}

function RoutesTileLayer({
  config,
  onTileError,
  onTileLoad,
}: {
  config: MapTileConfig;
  onTileError(): void;
  onTileLoad(): void;
}) {
  if (!config.isConfigured || !config.tileUrl || !config.attribution) return null;
  return (
    <TileLayer
      url={config.tileUrl}
      attribution={config.attribution}
      eventHandlers={{ tileerror: onTileError, tileload: onTileLoad }}
    />
  );
}

class RoutesMapErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Intentionally do not log route payloads or coordinates.
  }

  override render() {
    if (this.state.hasError) {
      return (
        <RoutesMapUnavailable reason="The interactive map could not be rendered. The route list remains available." />
      );
    }
    return this.props.children;
  }
}

function RoutesMapUnavailable({ reason }: { reason: string }) {
  return (
    <Card className="p-5" data-testid="admin-routes-map-unavailable">
      <h2 className="text-lg font-bold text-navy-900">Routes map</h2>
      <DataState title="Map unavailable" message={reason} />
    </Card>
  );
}

function RoutesMapCoordinateFallback({
  routes,
  missingConfig,
}: {
  routes: RouteMapRoute[];
  missingConfig: boolean;
}) {
  const withCoords = routes.filter((entry) =>
    entry.stops.some((s) => s.status !== 'archived' && hasValidCoordinates(s)),
  );

  return (
    <Card className="p-5" data-testid="admin-routes-map-fallback">
      <h2 className="text-lg font-bold text-navy-900">Routes map</h2>
      {missingConfig && (
        <div
          className="mt-3 rounded-lg bg-warning-50 p-3 text-sm text-warning-700"
          data-testid="admin-routes-map-config-missing"
        >
          Map tiles are not configured. An administrator must set VITE_MAP_TILE_URL and
          VITE_MAP_TILE_ATTRIBUTION in deployment environment variables.
        </div>
      )}
      {withCoords.length === 0 ? (
        <DataState
          title="No route stops with valid coordinates."
          message="Add latitude and longitude to route stops to see them plotted on the map."
        />
      ) : (
        <div className="mt-4">
          <p className="text-sm text-gray-600">
            {withCoords.length} route{withCoords.length === 1 ? '' : 's'} have stops with valid
            coordinates. Tile configuration is required for the interactive map.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {withCoords.map((entry) => (
              <li
                key={entry.route.id}
                className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm"
              >
                <span className="font-semibold text-navy-900">
                  {entry.route.route_name} ({entry.route.route_code})
                </span>
                <span className="block text-gray-600">
                  {entry.stops.filter((s) => hasValidCoordinates(s)).length} mapped stops
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

interface AdminRoutesMapProps {
  routes: RouteMapRoute[];
  tileConfig: MapTileConfig;
}

export function AdminRoutesMap({ routes, tileConfig }: AdminRoutesMapProps) {
  const [tileFailed, setTileFailed] = useState(false);

  const locations = useMemo(() => toLocations(routes), [routes]);
  const stopMarkerEntries = useMemo(
    () => buildCanonicalRouteStopMarkerEntries(routes),
    [routes],
  );
  const bounds = useMemo<LatLngBoundsExpression | null>(
    () =>
      locations.length === 0
        ? null
        : (locations.map((location) => location.position) as LatLngBoundsExpression),
    [locations],
  );
  const center = useMemo<LatLngExpression>(
    () => locations[0]?.position ?? [51.0447, -114.0719],
    [locations],
  );

  const handleTileError = useCallback(() => setTileFailed(true), []);
  const handleTileLoad = useCallback(() => setTileFailed(false), []);

  if (!tileConfig.isConfigured) {
    return <RoutesMapCoordinateFallback routes={routes} missingConfig />;
  }

  return (
    <RoutesMapErrorBoundary>
      <Card className="overflow-hidden" data-testid="admin-routes-map">
        <div className="border-b border-gray-100 p-5">
          <h2 className="text-lg font-bold text-navy-900">Routes map</h2>
          <p className="mt-1 text-sm text-gray-600">
            Numbered route stops plotted at their saved latitude and longitude. Each route uses a
            distinct color; the map does not imply a road path between stops.
          </p>
          {tileFailed && (
            <p
              role="alert"
              className="mt-3 rounded-md bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700"
              data-testid="admin-routes-map-tile-error"
            >
              Map tiles could not be loaded. Marker positions remain listed where supported.
            </p>
          )}
          {locations.length === 0 && (
            <p
              className="mt-3 text-sm font-semibold text-gray-700"
              data-testid="admin-routes-map-empty"
            >
              No route stops with valid coordinates.
            </p>
          )}
        </div>
        <section
          className="h-96"
          aria-label="Admin routes interactive map"
          data-testid="admin-routes-map-region"
        >
          <MapContainer
            center={center}
            zoom={locations.length === 1 ? 14 : 11}
            scrollWheelZoom
            className="h-full w-full"
            data-testid="admin-routes-leaflet-map"
          >
            <RoutesTileLayer
              config={tileConfig}
              onTileError={handleTileError}
              onTileLoad={handleTileLoad}
            />
            <FitRoutesControl bounds={bounds} disabled={locations.length === 0} />
            <NumberedRouteStopMarkers
              entries={stopMarkerEntries}
              paneName="admin-route-management-stops"
              testId="admin-routes-map-marker"
              density="compact"
            />
          </MapContainer>
        </section>
      </Card>
    </RoutesMapErrorBoundary>
  );
}
