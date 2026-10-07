import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
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

interface AssignmentSummary {
  busLabel: string;
  driverLabel: string | null;
  tripNames: string[];
}

function summarizeAssignments(assignments: RouteTileAssignment[]): AssignmentSummary[] {
  const grouped = new Map<string, AssignmentSummary>();

  assignments.forEach((assignment) => {
    if (!assignment.busLabel) return;
    const key = `${assignment.busLabel}\u0000${assignment.driverLabel ?? ''}`;
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.tripNames.includes(assignment.tripName)) {
        existing.tripNames.push(assignment.tripName);
      }
      return;
    }
    grouped.set(key, {
      busLabel: assignment.busLabel,
      driverLabel: assignment.driverLabel,
      tripNames: [assignment.tripName],
    });
  });

  return [...grouped.values()];
}

export function RouteTile({ route, schoolName, stopCount, assignments }: RouteTileProps) {
  const assignmentSummaries = summarizeAssignments(assignments);

  return (
    <Link
      to={`/admin/routes/${route.id}`}
      aria-label={`Open route ${route.route_name}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-slate-200 px-4 py-4 outline-none transition-colors first:border-t-0 hover:bg-slate-50 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy-500 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,.72fr)_minmax(4rem,.35fr)_minmax(0,1.4fr)_1.25rem] sm:items-center sm:px-5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
          style={{ backgroundColor: route.map_color }}
          aria-label={`Route color ${route.map_color}`}
        />
        <div className="min-w-0">
          <h3 className="truncate font-bold text-navy-900" title={route.route_name}>
            {route.route_name}
          </h3>
          <p className="mt-1 truncate text-sm text-gray-600">
            {route.route_code} ·{' '}
            {route.route_kind === 'field_trip' ? 'Field trip' : 'Regular service'}
          </p>
          <p
            className={`mt-1 text-sm font-medium ${
              route.definition_status === 'ready' ? 'text-success-700' : 'text-warning-700'
            }`}
          >
            {route.definition_status === 'ready' ? 'Map ready' : 'Setup incomplete'}
            {route.status !== 'active' ? ` · ${route.status}` : ''}
          </p>
        </div>
      </div>

      <div className="col-start-1 row-start-2 min-w-0 sm:col-auto sm:row-auto">
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 sm:hidden">
          School
        </span>
        <span className={schoolName ? 'font-medium text-navy-900' : 'text-gray-500'}>
          {schoolName ?? 'Not assigned'}
        </span>
      </div>

      <div className="col-start-2 row-start-2 text-right sm:col-auto sm:row-auto sm:text-left">
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 sm:hidden">
          Stops
        </span>
        <span className="font-medium text-navy-900">
          {stopCount}
          <span className="sm:hidden"> {stopCount === 1 ? 'stop' : 'stops'}</span>
        </span>
      </div>

      <div className="col-span-2 border-t border-slate-100 pt-3 sm:col-auto sm:border-0 sm:pt-0">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 sm:hidden">
          Bus and driver
        </span>
        {assignmentSummaries.length === 0 ? (
          <span className="text-sm text-gray-500">Not assigned</span>
        ) : (
          <div className="space-y-2">
            {assignmentSummaries.map((assignment) => (
              <div key={`${assignment.busLabel}-${assignment.driverLabel ?? ''}`}>
                <p className="font-semibold text-navy-900">{assignment.busLabel}</p>
                <p className="mt-0.5 text-sm text-gray-600">
                  {assignment.driverLabel ?? 'Driver not assigned'} ·{' '}
                  {assignment.tripNames.join(' + ')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <ChevronRight
        aria-hidden
        className="col-start-2 row-start-1 h-5 w-5 self-center text-navy-500 sm:col-auto sm:row-auto"
      />
    </Link>
  );
}
