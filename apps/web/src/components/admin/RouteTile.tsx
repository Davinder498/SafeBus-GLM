import { Button } from '@/components/ui/Button';
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
  canWrite: boolean;
  canDelete?: boolean;
  canAssignBus?: boolean;
  onEdit: () => void;
  onAssignBus?: () => void;
  onDelete?: () => void;
}

export function RouteTile({
  route,
  schoolName,
  stopCount,
  assignments,
  canWrite,
  canDelete = false,
  canAssignBus = false,
  onEdit,
  onAssignBus,
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

      {canWrite && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <Button type="button" size="sm" variant="secondary" onClick={onEdit}>
            Edit route
          </Button>
          {canAssignBus && onAssignBus && (
            <Button type="button" size="sm" onClick={onAssignBus}>
              Assign bus
            </Button>
          )}
          {canDelete && onDelete && (
            <Button
              type="button"
              size="sm"
              variant="danger"
              className="ml-auto"
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
