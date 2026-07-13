import { Link } from 'react-router-dom';
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
  to: string;
}

export function AdminRouteStatusTile({ route, stopCount, to }: AdminRouteStatusTileProps) {
  return (
    <Link
      to={to}
      className="group flex min-h-20 w-full items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm transition hover:border-navy-300 hover:bg-navy-50/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 sm:px-6"
      data-testid="admin-route-status-tile"
      aria-label={`View details for ${route.route_name}`}
    >
      <div className="min-w-0 text-left">
        <h3 className="truncate text-base font-bold text-navy-900" title={route.route_name}>
          {route.route_name}
        </h3>
        <p className="mt-1 truncate text-xs font-medium text-gray-500">
          {route.route_code} / {routeTypeLabels[route.route_type]} / {stopCount}{' '}
          {stopCount === 1 ? 'stop' : 'stops'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StatusPill tone={routeStatusTone[route.status]}>{route.status}</StatusPill>
        <span
          aria-hidden="true"
          className="text-lg text-navy-400 transition-transform group-hover:translate-x-1"
        >
          &rarr;
        </span>
      </div>
    </Link>
  );
}
