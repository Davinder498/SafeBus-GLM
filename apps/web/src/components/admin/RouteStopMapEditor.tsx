import { useMemo } from 'react';
import { divIcon, type LeafletMouseEvent, type Marker as LeafletMarker } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import type { MapTileConfig } from '@/config/mapTiles';
import type { RouteDefinitionStopInput } from '@/types/transportation';
import { isValidRouteCoordinate } from '@/utils/routeDefinition';

function ClickToPlace({
  selectedKey,
  onPlace,
}: {
  selectedKey: string | null;
  onPlace(key: string, latitude: number, longitude: number): void;
}) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      if (selectedKey) onPlace(selectedKey, event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

const stopIcon = divIcon({
  className: '',
  html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 1px 5px #111827"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export function RouteStopMapEditor({
  stops,
  selectedKey,
  tileConfig,
  onSelect,
  onPlace,
}: {
  stops: RouteDefinitionStopInput[];
  selectedKey: string | null;
  tileConfig: MapTileConfig;
  onSelect(key: string): void;
  onPlace(key: string, latitude: number, longitude: number): void;
}) {
  const placedStops = useMemo(
    () => stops.filter((stop) => isValidRouteCoordinate(stop.latitude, stop.longitude)),
    [stops],
  );
  const center: [number, number] = placedStops[0]
    ? [placedStops[0].latitude as number, placedStops[0].longitude as number]
    : [51.0447, -114.0719];

  if (!tileConfig.isConfigured || !tileConfig.tileUrl || !tileConfig.attribution) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        The map is unavailable. Enter latitude and longitude directly for each stop.
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm text-gray-600">
        Select a stop, then click the map to place it. Drag a marker to refine its position.
      </p>
      <div className="h-80 overflow-hidden rounded-lg border border-gray-200">
        <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full">
          <TileLayer url={tileConfig.tileUrl} attribution={tileConfig.attribution} />
          <ClickToPlace selectedKey={selectedKey} onPlace={onPlace} />
          {placedStops.map((stop, index) => (
            <Marker
              key={stop.clientKey}
              position={[stop.latitude as number, stop.longitude as number]}
              icon={stopIcon}
              draggable
              eventHandlers={{
                click: () => onSelect(stop.clientKey),
                dragend: (event) => {
                  const marker = event.target as LeafletMarker;
                  const point = marker.getLatLng();
                  onPlace(stop.clientKey, point.lat, point.lng);
                },
              }}
            >
              <Popup>
                <strong>
                  {index === 0 ? 'Start: ' : index === placedStops.length - 1 ? 'End: ' : ''}
                  {stop.stopName || `Stop ${stop.stopOrder}`}
                </strong>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
