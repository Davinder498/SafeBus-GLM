import { Component, type ErrorInfo, type ReactNode, useCallback, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import {
  RouteOverlayLayers,
  RouteOverlayLegend,
} from '@/components/maps/RouteOverlayLayers';
import type { MapTileConfig } from '@/config/mapTiles';
import { hasValidCoordinates, type AdminLiveTrip } from '@/types/adminLiveMonitoring';
import type { RouteOverlay } from '@/types/transportation';

export interface FleetMapFormatters {
  formatTimestamp(iso: string): string;
  formatSpeed(speedMps: number | null): string;
  locationLabel(status: AdminLiveTrip['locationStatus']): string;
  safeFleetLabel(trip: AdminLiveTrip): string;
}

interface FleetMapLocation {
  key: string;
  position: LatLngExpression;
  trip: AdminLiveTrip;
}

function toFleetMapLocations(trips: AdminLiveTrip[], safeFleetLabel: (trip: AdminLiveTrip) => string): FleetMapLocation[] {
  return trips.filter(hasValidCoordinates).map((trip, index) => ({
    key: `${safeFleetLabel(trip)}-${trip.startedAt}-${index}`,
    position: [trip.latestLatitude as number, trip.latestLongitude as number],
    trip,
  }));
}

function markerStyle(status: AdminLiveTrip['locationStatus']): { color: string; fillColor: string } {
  if (status === 'live') return { color: '#047857', fillColor: '#10b981' };
  if (status === 'stale') return { color: '#b45309', fillColor: '#f59e0b' };
  return { color: '#b91c1c', fillColor: '#ef4444' };
}

function FitFleetControl({ bounds, disabled }: { bounds: LatLngBoundsExpression | null; disabled: boolean }) {
  const map = useMap();
  const fitFleet = useCallback(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
  }, [bounds, map]);

  return (
    <div className="leaflet-top leaflet-right">
      <div className="leaflet-control m-3">
        <Button type="button" size="sm" variant="secondary" onClick={fitFleet} disabled={disabled} data-testid="admin-live-fleet-map-fit">
          Fit fleet
        </Button>
      </div>
    </div>
  );
}

function FleetTileLayer({ config, onTileError, onTileLoad }: { config: MapTileConfig; onTileError(): void; onTileLoad(): void }) {
  if (!config.isConfigured || !config.tileUrl || !config.attribution) return null;
  return <TileLayer url={config.tileUrl} attribution={config.attribution} eventHandlers={{ tileerror: onTileError, tileload: onTileLoad }} />;
}

class FleetMapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Intentionally do not log live fleet payloads or coordinates.
  }

  override render() {
    if (this.state.hasError) {
      return <FleetMapUnavailable reason="The interactive map could not be rendered. The operational fleet list remains available below." />;
    }
    return this.props.children;
  }
}

function FleetMapUnavailable({ reason }: { reason: string }) {
  return (
    <Card className="p-5" data-testid="admin-live-fleet-map-unavailable">
      <h2 className="text-lg font-bold text-navy-900">Live fleet map</h2>
      <DataState title="Map unavailable" message={reason} />
    </Card>
  );
}

function CoordinateFallback({ trips, formatters, missingConfig }: { trips: AdminLiveTrip[]; formatters: FleetMapFormatters; missingConfig: boolean }) {
  const locations = toFleetMapLocations(trips, formatters.safeFleetLabel);
  return (
    <Card className="p-5" data-testid={locations.length === 0 ? 'admin-live-fleet-map-empty' : 'admin-live-fleet-map-fallback'}>
      <h2 className="text-lg font-bold text-navy-900">Live fleet map</h2>
      {missingConfig && (
        <div className="mt-3 rounded-lg bg-warning-50 p-3 text-sm text-warning-700" data-testid="admin-live-fleet-map-config-missing">
          Map tiles are not configured. An administrator must set VITE_MAP_TILE_URL and VITE_MAP_TILE_ATTRIBUTION in deployment environment variables. The fleet list remains the primary operational view.
        </div>
      )}
      {locations.length === 0 ? (
        <DataState title="No active buses with valid coordinates." message="Active trips are listed below. Map markers appear after a current GPS update includes valid coordinates." />
      ) : (
        <div className="mt-4">
          <p className="text-sm text-gray-600">Valid current locations available for {locations.length} active bus{locations.length === 1 ? '' : 'es'}. Tile configuration is required for the interactive map.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Current fleet locations summary">
            {locations.map(({ key, trip }) => (
              <li key={key} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm" data-testid="admin-live-fleet-map-marker">
                <span className="font-semibold text-navy-900">{formatters.safeFleetLabel(trip)}</span>
                <span className="block text-gray-600">{trip.routeName ?? 'Route unavailable'} · {formatters.locationLabel(trip.locationStatus)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function AdminFleetMap({ trips, overlays = [], tileConfig, formatters }: { trips: AdminLiveTrip[]; overlays?: RouteOverlay[]; tileConfig: MapTileConfig; formatters: FleetMapFormatters }) {
  const [tileFailed, setTileFailed] = useState(false);
  const locations = useMemo(() => toFleetMapLocations(trips, formatters.safeFleetLabel), [trips, formatters.safeFleetLabel]);
  const overlayPositions = useMemo(
    () => overlays.flatMap((overlay) => overlay.stops.map((stop) => [stop.latitude, stop.longitude] as LatLngExpression)),
    [overlays],
  );
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const positions = [...overlayPositions, ...locations.map((location) => location.position)];
    return positions.length === 0 ? null : positions as LatLngBoundsExpression;
  }, [locations, overlayPositions]);
  const center = useMemo<LatLngExpression>(() => locations[0]?.position ?? overlayPositions[0] ?? [51.0447, -114.0719], [locations, overlayPositions]);

  const handleTileError = useCallback(() => setTileFailed(true), []);
  const handleTileLoad = useCallback(() => setTileFailed(false), []);

  if (!tileConfig.isConfigured) {
    return <CoordinateFallback trips={trips} formatters={formatters} missingConfig />;
  }

  return (
    <FleetMapErrorBoundary>
      <Card className="overflow-hidden" data-testid="admin-live-fleet-map">
        <div className="border-b border-gray-100 p-5">
          <h2 className="text-lg font-bold text-navy-900">Live fleet map</h2>
          <p className="mt-1 text-sm text-gray-600">Colored numbered dots show the active route stops without implying a road path. Live bus markers show valid current coordinates and remain above the stop markers.</p>
          <RouteOverlayLegend overlays={overlays} />
          {tileFailed && <p role="alert" className="mt-3 rounded-md bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700" data-testid="admin-live-fleet-map-tile-error">Map tiles could not be loaded. Markers and the fleet list remain available where supported.</p>}
          {locations.length === 0 && <p className="mt-3 text-sm font-semibold text-gray-700" data-testid="admin-live-fleet-map-empty">No active buses with valid coordinates.</p>}
        </div>
        <section className="h-96" aria-label="Admin live fleet interactive map" data-testid="admin-live-fleet-map-region">
          <MapContainer center={center} zoom={locations.length === 1 ? 14 : 11} scrollWheelZoom className="h-full w-full" data-testid="admin-live-fleet-leaflet-map">
            <FleetTileLayer config={tileConfig} onTileError={handleTileError} onTileLoad={handleTileLoad} />
            <FitFleetControl bounds={bounds} disabled={bounds === null} />
            <RouteOverlayLayers overlays={overlays} />
            {locations.map(({ key, position, trip }) => {
              const style = markerStyle(trip.locationStatus);
              return (
                <CircleMarker key={key} center={position} radius={10} pathOptions={{ ...style, fillOpacity: 0.8, weight: 3 }} data-testid="admin-live-fleet-map-marker">
                  <Popup>
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">{formatters.safeFleetLabel(trip)}</p>
                      <p>Route: {trip.routeName ?? 'Route unavailable'}</p>
                      <p>Trip status: {trip.status}</p>
                      <p>GPS status: {formatters.locationLabel(trip.locationStatus)}</p>
                      <p>Speed: {formatters.formatSpeed(trip.speedMps)}</p>
                      <p>Last update: {trip.latestLocationAt ? formatters.formatTimestamp(trip.latestLocationAt) : 'No GPS update yet'}</p>
                      {trip.driverName && <p>Driver: {trip.driverName}</p>}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </section>
      </Card>
    </FleetMapErrorBoundary>
  );
}
