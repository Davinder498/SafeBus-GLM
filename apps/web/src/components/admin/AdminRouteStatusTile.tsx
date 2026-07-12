import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import type { Route, RouteStatus, RouteType } from '@/types/transportation';

const routeStatusTone: Record<RouteStatus, 'success' | 'danger' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  archived: 'danger',
};

const routeTypeLabels: Record<RouteType, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  special: 'Special',
  field_trip: 'Field trip',
};

export interface RouteStatusTileAssignment {
  busLabel: string | null;
  driverLabel: string | null;
  tripType: string | null;
}

interface AdminRouteStatusTileProps {
  route: Route;
  schoolName: string | null;
  stopCount: number;
  assignments: RouteStatusTileAssignment[];
  hasMappedStops?: boolean;
  isActive?: boolean;
  onClick?: () => void;
}

export function AdminRouteStatusTile({
  route,
  schoolName,
  stopCount,
  assignments,
  hasMappedStops = false,
  isActive = false,
  onClick,
}: AdminRouteStatusTileProps) {
  const activeAssignments = assignments.filter((a) => a.busLabel);
  const hasCoordinates = hasMappedStops;

  const isClickable = !!onClick;

  return (
    <Card
      className={`flex h-full flex-col p-5 transition-shadow ${
        isClickable ? 'cursor-pointer hover:shadow-md' : ''
      } ${isActive ? 'ring-2 ring-navy-500' : ''}`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!isClickable}
        className="flex flex-1 flex-col text-left disabled:cursor-default"
        data-testid="admin-route-status-tile"
        aria-label={`View ${route.route_name} on map`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500">
              {route.route_code}
            </p>
            <h3
              className="mt-1 truncate text-lg font-bold text-navy-900"
              title={route.route_name}
            >
              {route.route_name}
            </h3>
          </div>
          <StatusPill tone={routeStatusTone[route.status]}>{route.status}</StatusPill>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-700 ring-1 ring-navy-100">
            {routeTypeLabels[route.route_type]}
          </span>
          <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
            {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
          </span>
          {hasCoordinates && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
              Mapped
            </span>
          )}
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">School</dt>
            <dd className="truncate text-right font-semibold text-navy-900">
              {schoolName ?? 'No school'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">Bus</dt>
            <dd className="truncate text-right font-semibold text-navy-900">
              {activeAssignments.length > 0
                ? activeAssignments.map((a) => a.busLabel).join(', ')
                : 'Not assigned'}
            </dd>
          </div>
          {activeAssignments.length > 0 && activeAssignments[0].driverLabel && (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Driver</dt>
              <dd className="truncate text-right font-semibold text-navy-900">
                {activeAssignments[0].driverLabel}
              </dd>
            </div>
          )}
        </dl>

        {isClickable && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <span className="text-sm font-semibold text-navy-700">
              {isActive ? 'Showing on map' : 'View on map'} &rarr;
            </span>
          </div>
        )}
      </button>
    </Card>
  );
}