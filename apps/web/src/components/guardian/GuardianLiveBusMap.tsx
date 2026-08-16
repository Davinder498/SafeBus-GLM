import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import type { MapTileConfig } from '@/config/mapTiles';
import type { GuardianStudentLiveBusLocation } from '@/types/guardianLiveBusLocation';

export interface GuardianLiveBusMapProps {
  locations: GuardianStudentLiveBusLocation[];
  tileConfig: MapTileConfig;
  regionLabel?: string;
}

interface MapMarkerEntry {
  key: string;
  position: [number, number];
  busNumber: string;
  licensePlate: string | null;
  locationRecordedAt: string | null;
}

function isValidCoordinate(lat: number | null, lng: number | null): boolean {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

function buildMarkerEntries(locations: GuardianStudentLiveBusLocation[]): MapMarkerEntry[] {
  const grouped = new Map<string, MapMarkerEntry>();
  for (const location of locations) {
    if (
      location.locationState !== 'fresh' ||
      !location.busNumber ||
      !isValidCoordinate(location.latitude, location.longitude)
    ) {
      continue;
    }
    const latitude = location.latitude as number;
    const longitude = location.longitude as number;
    const key = `${location.busNumber}|${latitude.toFixed(5)}|${longitude.toFixed(5)}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        position: [latitude, longitude],
        busNumber: location.busNumber,
        licensePlate: location.licensePlate,
        locationRecordedAt: location.locationRecordedAt,
      });
    }
  }
  return Array.from(grouped.values());
}

class GuardianMapBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Guardian location payloads are deliberately not logged.
  }

  override render() {
    if (this.state.hasError) return <GuardianMapUnavailable />;
    return this.props.children;
  }
}

function GuardianMapUnavailable({
  reason = 'The interactive map could not be shown. Bus status remains available.',
  availableBusCount = 0,
}: {
  reason?: string;
  availableBusCount?: number;
}) {
  return (
    <Card className="p-5" data-testid="guardian-live-bus-map-unavailable">
      <h2 className="text-lg font-bold text-navy-900">Live bus map</h2>
      <DataState title="Map unavailable" message={reason} />
      {availableBusCount > 0 && (
        <p className="mt-3 text-sm font-semibold text-success-700">
          Current location is still available for {availableBusCount} bus
          {availableBusCount === 1 ? '' : 'es'} in the status list below.
        </p>
      )}
    </Card>
  );
}

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const timeoutId = window.setTimeout(() => map.invalidateSize(), 0);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => {
      window.clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

export function GuardianLiveBusMap({
  locations,
  tileConfig,
  regionLabel = 'Guardian live bus interactive map',
}: GuardianLiveBusMapProps) {
  const [tileFailed, setTileFailed] = useState(false);
  const markerEntries = useMemo(() => buildMarkerEntries(locations), [locations]);
  const center = useMemo<LatLngExpression>(
    () => markerEntries[0]?.position ?? [51.0447, -114.0719],
    [markerEntries],
  );
  const handleTileError = useCallback(() => setTileFailed(true), []);

  if (!tileConfig.isConfigured || !tileConfig.tileUrl || !tileConfig.attribution) {
    return (
      <Card className="p-5" data-testid="guardian-live-bus-map-config-missing">
        <h2 className="text-lg font-bold text-navy-900">Live bus map</h2>
        <p className="mt-2 text-sm text-gray-600">
          The interactive map is not available right now. Bus status remains available below.
        </p>
        {markerEntries.length > 0 && (
          <p
            className="mt-3 text-sm font-semibold text-success-700"
            data-testid="guardian-live-bus-map-fresh-summary"
          >
            Current location is available for {markerEntries.length} bus
            {markerEntries.length === 1 ? '' : 'es'}.
          </p>
        )}
      </Card>
    );
  }

  if (tileFailed) {
    return (
      <GuardianMapUnavailable
        reason="The map provider could not load. Verified bus status remains available below."
        availableBusCount={markerEntries.length}
      />
    );
  }

  return (
    <GuardianMapBoundary>
      <Card className="overflow-hidden" data-testid="guardian-live-bus-map">
        <div className="border-b border-gray-100 p-5">
          <h2 className="text-lg font-bold text-navy-900">Live bus map</h2>
          <p className="mt-1 text-sm text-gray-600">
            Only the current bus location is shown. Route lines and other operational details are
            not displayed.
          </p>
          {markerEntries.length === 0 && (
            <p
              className="mt-3 text-sm font-semibold text-gray-700"
              data-testid="guardian-live-bus-map-empty"
            >
              No current bus location to show right now.
            </p>
          )}
        </div>
        <section
          className="h-80"
          aria-label={regionLabel}
          data-testid="guardian-live-bus-map-region"
        >
          <MapContainer
            center={center}
            zoom={markerEntries.length === 1 ? 14 : 11}
            scrollWheelZoom
            className="h-full w-full"
            data-testid="guardian-live-bus-leaflet-map"
          >
            <MapResizer />
            <TileLayer
              url={tileConfig.tileUrl}
              attribution={tileConfig.attribution}
              referrerPolicy="strict-origin"
              eventHandlers={{ tileerror: handleTileError }}
            />
            {markerEntries.map((entry) => (
              <CircleMarker
                key={entry.key}
                center={entry.position}
                radius={10}
                pathOptions={{
                  color: '#047857',
                  fillColor: '#10b981',
                  fillOpacity: 0.8,
                  weight: 3,
                }}
                data-testid="guardian-live-bus-map-marker"
              >
                <Popup>
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">Bus {entry.busNumber}</p>
                    {entry.licensePlate && <p>Plate {entry.licensePlate}</p>}
                    {entry.locationRecordedAt && (
                      <p>Updated {new Date(entry.locationRecordedAt).toLocaleString()}</p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </section>
        <p className="sr-only" data-testid="guardian-live-bus-map-sr-status">
          {markerEntries.length === 0
            ? 'No current bus location is available on the map.'
            : `${markerEntries.length} current bus location${markerEntries.length === 1 ? '' : 's'} shown on the map.`}
        </p>
      </Card>
    </GuardianMapBoundary>
  );
}
