import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { divIcon, latLngBounds, type LatLngExpression } from 'leaflet';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import type { MapTileConfig } from '@/config/mapTiles';
import type {
  GuardianBusServiceLine,
  GuardianStudentLiveBusLocation,
} from '@/types/guardianLiveBusLocation';

export interface GuardianLiveBusMapProps {
  locations: GuardianStudentLiveBusLocation[];
  serviceLines?: GuardianBusServiceLine[];
  tileConfig: MapTileConfig;
  regionLabel?: string;
  fullScreen?: boolean;
}

type StopMarkerKind = 'pickup' | 'dropoff' | 'both';

interface StopMarkerEntry {
  key: string;
  position: [number, number];
  kind: StopMarkerKind;
  stopNames: string[];
  pickupStudentNames: string[];
  dropoffStudentNames: string[];
}

const busMarkerIcon = divIcon({
  className: 'guardian-map-icon-shell',
  html: `<span class="guardian-map-icon guardian-map-icon--bus" data-testid="guardian-live-bus-map-marker" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M8 6h8M6 17h12M6 10h12M8 20v-2m8 2v-2M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"/></svg></span>`,
  iconSize: [42, 42],
  iconAnchor: [21, 21],
  popupAnchor: [0, -22],
});

function stopMarkerIcon(kind: StopMarkerKind) {
  const label = kind === 'pickup' ? 'P' : kind === 'dropoff' ? 'D' : 'P/D';
  return divIcon({
    className: 'guardian-map-icon-shell',
    html: `<span class="guardian-map-icon guardian-map-icon--${kind}" data-testid="guardian-live-map-${kind}-stop-marker" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><b>${label}</b></span>`,
    iconSize: [36, 42],
    iconAnchor: [18, 40],
    popupAnchor: [0, -38],
  });
}

const stopMarkerIcons: Record<StopMarkerKind, ReturnType<typeof divIcon>> = {
  pickup: stopMarkerIcon('pickup'),
  dropoff: stopMarkerIcon('dropoff'),
  both: stopMarkerIcon('both'),
};

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

function buildStopMarkerEntries(serviceLines: GuardianBusServiceLine[]): StopMarkerEntry[] {
  const grouped = new Map<
    string,
    {
      position: [number, number];
      stopNames: Set<string>;
      pickupStudentNames: Set<string>;
      dropoffStudentNames: Set<string>;
    }
  >();

  for (const line of serviceLines) {
    for (const stop of line.stops) {
      if (
        !isValidCoordinate(stop.latitude, stop.longitude) ||
        (stop.pickupStudentNames.length === 0 && stop.dropoffStudentNames.length === 0)
      ) {
        continue;
      }
      const latitude = stop.latitude as number;
      const longitude = stop.longitude as number;
      const key = `${latitude.toFixed(6)}|${longitude.toFixed(6)}`;
      const entry = grouped.get(key) ?? {
        position: [latitude, longitude] as [number, number],
        stopNames: new Set<string>(),
        pickupStudentNames: new Set<string>(),
        dropoffStudentNames: new Set<string>(),
      };
      entry.stopNames.add(stop.name);
      stop.pickupStudentNames.forEach((name) => entry.pickupStudentNames.add(name));
      stop.dropoffStudentNames.forEach((name) => entry.dropoffStudentNames.add(name));
      grouped.set(key, entry);
    }
  }

  return Array.from(grouped.entries()).map(([key, entry]) => ({
    key,
    position: entry.position,
    kind:
      entry.pickupStudentNames.size > 0 && entry.dropoffStudentNames.size > 0
        ? 'both'
        : entry.pickupStudentNames.size > 0
          ? 'pickup'
          : 'dropoff',
    stopNames: Array.from(entry.stopNames).sort((left, right) => left.localeCompare(right)),
    pickupStudentNames: Array.from(entry.pickupStudentNames).sort((left, right) =>
      left.localeCompare(right),
    ),
    dropoffStudentNames: Array.from(entry.dropoffStudentNames).sort((left, right) =>
      left.localeCompare(right),
    ),
  }));
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

function MapBounds({ positions }: { positions: Array<[number, number]> }) {
  const map = useMap();
  const signature = positions.map(([latitude, longitude]) => `${latitude},${longitude}`).join('|');
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 14);
      return;
    }
    map.fitBounds(latLngBounds(positions), { padding: [32, 32], maxZoom: 15 });
    // The coordinate signature deliberately drives viewport updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);
  return null;
}

export function GuardianLiveBusMap({
  locations,
  serviceLines = [],
  tileConfig,
  regionLabel = 'Guardian live bus interactive map',
  fullScreen = false,
}: GuardianLiveBusMapProps) {
  const [tileFailed, setTileFailed] = useState(false);
  const markerEntries = useMemo(() => buildMarkerEntries(locations), [locations]);
  const stopMarkerEntries = useMemo(() => buildStopMarkerEntries(serviceLines), [serviceLines]);
  const allPositions = useMemo(
    () => [
      ...markerEntries.map((entry) => entry.position),
      ...stopMarkerEntries.map((entry) => entry.position),
    ],
    [markerEntries, stopMarkerEntries],
  );
  const center = useMemo<LatLngExpression>(
    () => allPositions[0] ?? [51.0447, -114.0719],
    [allPositions],
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
      <Card
        className={
          fullScreen
            ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 shadow-none'
            : 'overflow-hidden'
        }
        data-testid="guardian-live-bus-map"
      >
        {!fullScreen && (
          <div className="border-b border-gray-100 p-5">
            <h2 className="text-lg font-bold text-navy-900">Live bus map</h2>
            <p className="mt-1 text-sm text-gray-600">
              The selected bus and its assigned pickup and drop-off locations are shown.
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
        )}
        <section
          className={fullScreen ? 'min-h-0 flex-1' : 'h-80'}
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
            <MapBounds positions={allPositions} />
            <TileLayer
              url={tileConfig.tileUrl}
              attribution={tileConfig.attribution}
              referrerPolicy="strict-origin"
              eventHandlers={{ tileerror: handleTileError }}
            />
            {markerEntries.map((entry) => (
              <Marker
                key={entry.key}
                position={entry.position}
                icon={busMarkerIcon}
                title={`Bus ${entry.busNumber}`}
                alt={`Current location of Bus ${entry.busNumber}`}
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
              </Marker>
            ))}
            {stopMarkerEntries.map((entry) => (
              <Marker
                key={entry.key}
                position={entry.position}
                icon={stopMarkerIcons[entry.kind]}
                title={
                  entry.kind === 'both'
                    ? 'Pickup and drop-off location'
                    : entry.kind === 'pickup'
                      ? 'Pickup location'
                      : 'Drop-off location'
                }
                alt={
                  entry.kind === 'both'
                    ? 'Pickup and drop-off location'
                    : entry.kind === 'pickup'
                      ? 'Pickup location'
                      : 'Drop-off location'
                }
              >
                <Popup>
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">{entry.stopNames.join(' / ')}</p>
                    {entry.pickupStudentNames.length > 0 && (
                      <p>Pickup for {entry.pickupStudentNames.join(', ')}</p>
                    )}
                    {entry.dropoffStudentNames.length > 0 && (
                      <p>Drop-off for {entry.dropoffStudentNames.join(', ')}</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </section>
        <p className="sr-only" data-testid="guardian-live-bus-map-sr-status">
          {markerEntries.length === 0
            ? `No current bus location is available. ${stopMarkerEntries.length} assigned stop location${stopMarkerEntries.length === 1 ? '' : 's'} shown.`
            : `${markerEntries.length} current bus location${markerEntries.length === 1 ? '' : 's'} and ${stopMarkerEntries.length} assigned stop location${stopMarkerEntries.length === 1 ? '' : 's'} shown on the map.`}
        </p>
      </Card>
    </GuardianMapBoundary>
  );
}
