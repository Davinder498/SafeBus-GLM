import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import type { Route } from '@/types/transportation';

export interface RouteTileAssignment {
  busLabel: string | null;
  driverLabel: string | null;
  tripName: string;
}

interface RouteTileProps {
  route: Route;
  schoolName: string | null;
  stopCount: number;
  assignments: RouteTileAssignment[];
}

export function RouteTile({ route, schoolName, stopCount, assignments }: RouteTileProps) {
  const activeAssignments = assignments.filter((a) => a.busLabel);

  return (
    <Link
      to={`/admin/routes/${route.id}`}
      aria-label={`Open route ${route.route_name}`}
      className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
    >
      <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500">
              {route.route_code}
            </p>
            <h3 className="mt-1 truncate text-lg font-bold text-navy-900" title={route.route_name}>
              {route.route_name}
            </h3>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {route.status !== 'active' && (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize text-gray-700">
              {route.status}
            </span>
          )}
          <span
            className="h-5 w-5 rounded-full border-2 border-white shadow"
            style={{ backgroundColor: route.map_color }}
            aria-label={`Route color ${route.map_color}`}
          />
          <span className="inline-flex items-center rounded-full bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-700 ring-1 ring-navy-100">
            {route.route_kind === 'field_trip' ? 'Field trip' : 'Regular service'}
          </span>
          <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
            {route.definition_status === 'ready' ? 'Map ready' : 'Setup incomplete'}
          </span>
          <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
            {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
          </span>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">School</dt>
            <dd className="truncate text-right font-semibold text-navy-900">
              {schoolName ?? 'No school'}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-gray-500">Bus trips</dt>
            <dd className="min-w-0 space-y-2 text-right">
              {activeAssignments.length === 0 ? (
                <span className="font-semibold text-navy-900">Not assigned</span>
              ) : (
                activeAssignments.map((assignment, index) => (
                  <div key={`${assignment.tripName}-${assignment.busLabel}-${index}`}>
                    <p className="font-semibold text-navy-900">
                      {assignment.tripName}: {assignment.busLabel}
                    </p>
                    <p className="text-xs text-gray-500">
                      Driver: {assignment.driverLabel ?? 'Not assigned'}
                    </p>
                  </div>
                ))
              )}
            </dd>
          </div>
        </dl>
      </Card>
    </Link>
  );
}
