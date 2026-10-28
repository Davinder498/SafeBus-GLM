import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { Card } from '@/components/ui/Card';
import { useMapTileConfig } from '@/hooks/useMapTileConfig';
import type { AdminTripDetail } from '@/types/adminTripDetail';
import type { LatLngTuple } from 'leaflet';

class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <p className="p-5" role="status">
        Map unavailable. Trip details and stops remain available.
      </p>
    ) : (
      this.props.children
    );
  }
}

function FitTrip({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [32, 32], maxZoom: 15 });
  }, [map, points]);
  return null;
}

function TripMapContent({
  detail,
  location,
}: {
  detail: AdminTripDetail;
  location: AdminTripDetail['location'];
}) {
  const config = useMapTileConfig();
  const [tileFailed, setTileFailed] = useState(false);
  const stops = detail.stops.filter(
    (s) =>
      s.latitude !== null &&
      s.longitude !== null &&
      Number.isFinite(s.latitude) &&
      Math.abs(s.latitude) <= 90 &&
      Number.isFinite(s.longitude) &&
      Math.abs(s.longitude) <= 180,
  );
  const stopPoints = stops.map((s) => [s.latitude!, s.longitude!] as LatLngTuple);
  const path =
    detail.shape?.geojson?.coordinates
      ?.filter(
        ([lng, lat]) =>
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lng) <= 180,
      )
      .map(([lng, lat]) => [lat, lng] as LatLngTuple) ?? [];
  const boundsKey = JSON.stringify([...path, ...stopPoints]);
  const bounds = useMemo<LatLngTuple[]>(() => JSON.parse(boundsKey), [boundsKey]);
  const center: LatLngTuple | undefined =
    bounds[0] ?? (location ? [location.latitude, location.longitude] : undefined);
  if (!config.isConfigured || !config.tileUrl || !config.attribution || tileFailed)
    return (
      <p role="status" className="p-5 text-sm text-gray-600">
        Map unavailable. The platform map service could not load. Trip details and stops remain
        available.
      </p>
    );
  if (!center)
    return (
      <p className="p-5 text-sm text-gray-600">
        No mapped route or location is available for this trip.
      </p>
    );
  return (
    <div className="h-96" aria-label="Trip route and bus map">
      <MapContainer center={center} zoom={12} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          url={config.tileUrl}
          attribution={config.attribution}
          referrerPolicy="strict-origin"
          eventHandlers={{ tileerror: () => setTileFailed(true) }}
        />
        <FitTrip points={bounds} />
        {path.length > 1 && (
          <Polyline positions={path} pathOptions={{ color: '#2563eb', weight: 5 }} />
        )}
        {stops.map((s) => (
          <CircleMarker
            key={s.id}
            center={[s.latitude!, s.longitude!]}
            radius={6}
            pathOptions={{ color: '#1e3a5f', fillOpacity: 1 }}
          >
            <Popup>
              {detail.stops.indexOf(s) + 1}. {s.name}
            </Popup>
          </CircleMarker>
        ))}
        {location && (
          <CircleMarker
            center={[location.latitude, location.longitude]}
            radius={11}
            pathOptions={{ color: '#047857', fillColor: '#10b981', fillOpacity: 1 }}
          >
            <Popup>Bus {detail.trip.busLabel}</Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}

export function AdminTripMap(props: {
  detail: AdminTripDetail;
  location: AdminTripDetail['location'];
}) {
  return (
    <Card className="overflow-hidden" data-testid="admin-trip-map">
      <h2 className="border-b border-gray-100 p-5 text-lg font-bold text-navy-900">Trip map</h2>
      {props.detail.shape?.basis === 'current' && (
        <p className="px-5 pt-3 text-xs text-gray-600">
          Current published route; no road path was saved with this trip.
        </p>
      )}
      <MapBoundary>
        <TripMapContent {...props} />
      </MapBoundary>
    </Card>
  );
}
