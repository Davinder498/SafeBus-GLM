import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import type { Route, RouteStatus } from '@/types/transportation';

const routeStatusTone: Record<RouteStatus, 'success' | 'danger' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  archived: 'danger',
};

export interface RouteTileAssignment {
  busLabel: string | null;
  driverLabel: string | null;
  tripType: string | null;
}

interface RouteTileProps {
  route: Route;
  schoolName: string | null;
  stopCount: number;
  assignments: RouteTileAssignment[];
  canWrite: boolean;
  canDelete?: boolean;
  onEdit: () => void;
  onDelete?: () => void;
}

export function RouteTile({
  route,
  schoolName,
  stopCount,
  assignments,
  canWrite,
  canDelete = false,
  onEdit,
  onDelete,
}: RouteTileProps) {
  const activeAssignments = assignments.filter((a) => a.busLabel);

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500">
            {route.route_code}
          </p>
          <h3 className="mt-1 truncate text-lg font-bold text-navy-900" title={route.route_name}>
            {route.route_name}
          </h3>
        </div>
        <StatusPill tone={routeStatusTone[route.status]}>{route.status}</StatusPill>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="h-5 w-5 rounded-full border-2 border-white shadow" style={{ backgroundColor: route.map_color }} aria-label={`Route color ${route.map_color}`} />
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

      {canWrite && (
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onEdit}
            className="text-sm font-semibold text-navy-700 hover:text-navy-900 hover:underline"
          >
            Edit route &rarr;
          </button>
          {canDelete && onDelete && (
            <Button type="button" size="sm" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
