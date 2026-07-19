import { divIcon } from 'leaflet';
import { Marker, Pane, Popup } from 'react-leaflet';
import {
  groupRouteStopMarkerEntries,
  readableMarkerTextColor,
  safeRouteColor,
  type RouteStopMarkerEntry,
  type RouteStopMarkerGroup,
} from '@/utils/routeStopMarkers';

function markerBackground(group: RouteStopMarkerGroup): string {
  const colors = Array.from(new Set(group.entries.map((entry) => safeRouteColor(entry.color))));
  if (colors.length === 1) return colors[0];

  const segmentSize = 360 / colors.length;
  const segments = colors.map(
    (color, index) => `${color} ${index * segmentSize}deg ${(index + 1) * segmentSize}deg`,
  );
  return `conic-gradient(${segments.join(', ')})`;
}

function markerLabel(group: RouteStopMarkerGroup): string {
  if (group.entries.length === 1) {
    const entry = group.entries[0];
    const terminal =
      entry.terminal === 'start' ? 'Start stop' : entry.terminal === 'end' ? 'End stop' : 'Stop';
    return `${terminal} ${entry.stopNumber}: ${entry.stopName}, route ${entry.routeCode}`;
  }
  return `${group.entries.length} route stops at this location`;
}

function createStopIcon(group: RouteStopMarkerGroup, testId: string) {
  const isCombined = group.entries.length > 1;
  const isTerminal = group.entries.some((entry) => entry.terminal !== null);
  const size = isCombined || isTerminal ? 36 : 30;
  const label = isCombined ? String(group.entries.length) : String(group.entries[0].stopNumber);
  const background = markerBackground(group);
  const textColor =
    isCombined || background.startsWith('conic-gradient')
      ? '#FFFFFF'
      : readableMarkerTextColor(background);

  return divIcon({
    className: '',
    html: `<span data-testid="${testId}" data-route-stop-count="${group.entries.length}" aria-hidden="true" style="display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;border-radius:9999px;background:${background};border:3px solid #ffffff;box-shadow:0 1px 5px #111827;color:${textColor};font-size:${isCombined ? 13 : 14}px;font-weight:800;line-height:1"><span style="${isCombined ? 'display:flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:9999px;background:rgba(17,24,39,0.78)' : ''}">${label}</span></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function StopDetails({ entry }: { entry: RouteStopMarkerEntry }) {
  const terminalLabel =
    entry.terminal === 'start' ? 'Start: ' : entry.terminal === 'end' ? 'End: ' : '';

  return (
    <div className="space-y-1 text-sm">
      <p className="font-semibold">
        {terminalLabel}
        {entry.stopName}
      </p>
      <p>
        Route: {entry.routeName} ({entry.routeCode})
      </p>
      {entry.tripName && entry.direction && (
        <p>
          Trip: {entry.tripName} ({entry.direction === 'forward' ? 'Start → End' : 'End → Start'})
        </p>
      )}
      <p>Stop number: {entry.stopNumber}</p>
      {entry.plannedArrivalTime && <p>Planned arrival: {entry.plannedArrivalTime.slice(0, 5)}</p>}
    </div>
  );
}

export function NumberedRouteStopMarkers({
  entries,
  paneName,
  testId,
}: {
  entries: RouteStopMarkerEntry[];
  paneName: string;
  testId: string;
}) {
  const groups = groupRouteStopMarkerEntries(entries);

  return (
    <Pane name={paneName} style={{ zIndex: 350 }}>
      {groups.map((group) => {
        const label = markerLabel(group);
        return (
          <Marker
            key={group.key}
            position={group.position}
            icon={createStopIcon(group, testId)}
            title={label}
            alt={label}
            keyboard
          >
            <Popup>
              {group.entries.length > 1 ? (
                <div className="space-y-3">
                  <p className="font-semibold">
                    {group.entries.length} route stops at this location
                  </p>
                  <ul className="space-y-3">
                    {group.entries.map((entry) => (
                      <li
                        key={entry.id}
                        className="border-t border-gray-100 pt-2 first:border-0 first:pt-0"
                      >
                        <span
                          className="mr-2 inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: entry.color }}
                          aria-hidden="true"
                        />
                        <StopDetails entry={entry} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <StopDetails entry={group.entries[0]} />
              )}
            </Popup>
          </Marker>
        );
      })}
    </Pane>
  );
}
