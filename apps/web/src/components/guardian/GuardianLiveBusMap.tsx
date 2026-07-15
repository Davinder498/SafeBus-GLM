import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import type { MapTileConfig } from '@/config/mapTiles';
import type { GuardianStudentLiveBusLocation } from '@/types/guardianLiveBusLocation';

/**
 * A student context entry used to correlate safe location state with
 * guardian-authorized student names. Only `studentId` is used as a join key.
 */
export interface GuardianStudentContextEntry {
  studentId: string;
  studentName: string;
}

export interface GuardianLiveBusMapProps {
  /** Safe location-state rows from the Milestone 11A RPC. */
  locations: GuardianStudentLiveBusLocation[];
  /** Safe student context (names) from already-authorized guardian visibility. */
  studentContext: GuardianStudentContextEntry[];
  /** Public tile configuration. When unconfigured, the map degrades gracefully. */
  tileConfig: MapTileConfig;
  /** Optional accessible label for the map region. */
  regionLabel?: string;
}

interface MapMarkerEntry {
  key: string;
  position: [number, number];
  studentNames: string[];
  locationRecordedAt: string | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidCoordinate(lat: number | null, lng: number | null): boolean {
  return (
    isFiniteNumber(lat) &&
    isFiniteNumber(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Build the set of markers to render.
 *
 * Only `fresh` rows with valid coordinates produce a marker. Siblings sharing
 * the same coordinates are grouped into ONE marker so we never imply two buses
 * from matching points; the popup lists every linked student at that location.
 *
 * Stale, missing, invalid, loading, and error states intentionally produce no
 * marker. A stale position can never remain on the map looking live.
 */
function buildMarkerEntries(
  locations: GuardianStudentLiveBusLocation[],
  studentContext: GuardianStudentContextEntry[],
): MapMarkerEntry[] {
  const fresh = locations.filter(
    (loc) => loc.locationState === 'fresh' && isValidCoordinate(loc.latitude, loc.longitude),
  );

  const grouped = new Map<string, MapMarkerEntry>();
  for (const loc of fresh) {
    const lat = loc.latitude as number;
    const lng = loc.longitude as number;
    const key = `${lat.toFixed(5)}|${lng.toFixed(5)}`;
    const studentName =
      studentContext.find((s) => s.studentId === loc.studentId)?.studentName ?? 'Linked student';
    const existing = grouped.get(key);
    if (existing) {
      // Sibling/cotraveler at the exact same safe point: keep one marker and
      // list all linked students it applies to. Do NOT infer shared bus from
      // coordinates alone; the page explains this is "current bus location".
      if (!existing.studentNames.includes(studentName)) {
        existing.studentNames.push(studentName);
      }
    } else {
      grouped.set(key, {
        key,
        position: [lat, lng],
        studentNames: [studentName],
        locationRecordedAt: loc.locationRecordedAt,
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
    // Intentionally do not log guardian location payloads or coordinates.
  }

  override render() {
    if (this.state.hasError) {
      return <GuardianMapUnavailable />;
    }
    return this.props.children;
  }
}

function GuardianMapUnavailable() {
  return (
    <Card className="p-5" data-testid="guardian-live-bus-map-unavailable">
      <h2 className="text-lg font-bold text-navy-900">Live bus map</h2>
      <DataState
        title="Map unavailable"
        message="The interactive map could not be shown. Student status remains available."
      />
    </Card>
  );
}

/**
 * Keeps the Leaflet map in sync with its container size.
 *
 * Leaflet computes its tile layout once at initialization and does not detect
 * later container size changes (e.g. when this map mounts while the page is
 * still revealing content after an async data load). Without this, the map
 * tiles render blank or shifted inside the guardian layout. We call
 * `invalidateSize()` on mount and observe container resizes.
 */
function MapResizer() {
  const map = useMap();

  useEffect(() => {
    // Run once after mount so the map recalculates against the now-settled
    // container dimensions.
    map.invalidateSize();

    // Recalculate on any future container resize (responsive layout changes,
    // collapsible regions, font loading reflow, etc.).
    const container = map.getContainer();
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [map]);

  return null;
}

export function GuardianLiveBusMap({
  locations,
  studentContext,
  tileConfig,
  regionLabel = 'Guardian live bus interactive map',
}: GuardianLiveBusMapProps) {
  const [tileFailed, setTileFailed] = useState(false);

  const markerEntries = useMemo(
    () => buildMarkerEntries(locations, studentContext),
    [locations, studentContext],
  );

  const center = useMemo<LatLngExpression>(
    () => (markerEntries[0]?.position ?? [51.0447, -114.0719]) as LatLngExpression,
    [markerEntries],
  );

  const handleTileError = useCallback(() => setTileFailed(true), []);
  const handleTileLoad = useCallback(() => setTileFailed(false), []);

  if (!tileConfig.isConfigured || !tileConfig.tileUrl || !tileConfig.attribution) {
    return (
      <Card className="p-5" data-testid="guardian-live-bus-map-config-missing">
        <h2 className="text-lg font-bold text-navy-900">Live bus map</h2>
        <div className="mt-3 rounded-lg bg-navy-50 p-3 text-sm text-navy-700">
          The interactive map is not available right now. Student and trip status remains available below.
        </div>
        {markerEntries.length > 0 && (
          <p
            className="mt-3 text-sm text-gray-600"
            data-testid="guardian-live-bus-map-fresh-summary"
          >
            Current bus location is available for {markerEntries.length} linked student
            {markerEntries.length === 1 ? '' : 's'}.
          </p>
        )}
      </Card>
    );
  }

  return (
    <GuardianMapBoundary>
      <Card className="overflow-hidden" data-testid="guardian-live-bus-map">
        <div className="border-b border-gray-100 p-5">
          <h2 className="text-lg font-bold text-navy-900">Live bus map</h2>
          <p className="mt-1 text-sm text-gray-600">
            Shows the current bus location for your linked students when a fresh update is available.
            Map markers are shown only for current updates; delayed or unavailable location updates do not appear on the map.
          </p>
          {tileFailed && (
            <p
              role="alert"
              className="mt-3 rounded-md bg-warning-50 px-3 py-2 text-sm font-semibold text-warning-700"
              data-testid="guardian-live-bus-map-tile-error"
            >
              The map could not be loaded. Student status remains available.
            </p>
          )}
          {markerEntries.length === 0 && (
            <p
              className="mt-3 text-sm font-semibold text-gray-700"
              data-testid="guardian-live-bus-map-empty"
            >
              No current bus location to show on the map right now.
            </p>
          )}
        </div>
        <section className="h-80" aria-label={regionLabel} data-testid="guardian-live-bus-map-region">
          <MapContainer
            center={center}
            zoom={markerEntries.length === 1 ? 14 : 11}
            scrollWheelZoom
            className="h-full w-full"
            data-testid="guardian-live-bus-leaflet-map"
          >
            <MapResizer />
            <TileLayer
              url={tileConfig.tileUrl as string}
              attribution={tileConfig.attribution as string}
              eventHandlers={{ tileerror: handleTileError, tileload: handleTileLoad }}
            />
            {markerEntries.map((entry) => (
              <CircleMarker
                key={entry.key}
                center={entry.position}
                radius={10}
                pathOptions={{ color: '#047857', fillColor: '#10b981', fillOpacity: 0.8, weight: 3 }}
                data-testid="guardian-live-bus-map-marker"
              >
                <Popup>
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">Current bus location</p>
                    <p>For: {entry.studentNames.join(', ')}</p>
                    {entry.locationRecordedAt && (
                      <p>Updated: {new Date(entry.locationRecordedAt).toLocaleString()}</p>
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