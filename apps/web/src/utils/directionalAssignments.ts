import type { DirectionScope, RouteDirection } from '@/types/transportation';

type DatedDirectionalAssignment = {
  id: string;
  effective_from: string | null;
  effective_to: string | null;
  status: string;
};

export interface DirectionalAssignmentGroup<T extends DatedDirectionalAssignment> {
  id: string;
  assignments: T[];
  forward: T | null;
  reverse: T | null;
  directionScope: DirectionScope;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: string;
}

export function directionScopeFromDirections(directions: RouteDirection[]): DirectionScope {
  if (directions.includes('forward') && directions.includes('reverse')) return 'both';
  return directions.includes('reverse') ? 'reverse' : 'forward';
}

export function groupDirectionalAssignments<T extends DatedDirectionalAssignment>(
  assignments: T[],
  identity: (assignment: T) => string,
  direction: (assignment: T) => RouteDirection | null,
): DirectionalAssignmentGroup<T>[] {
  const groups = new Map<string, Array<{ assignment: T; direction: RouteDirection }>>();

  for (const assignment of assignments) {
    const assignmentDirection = direction(assignment);
    if (!assignmentDirection) continue;
    const key = [
      identity(assignment),
      assignment.effective_from ?? '',
      assignment.effective_to ?? '',
      assignment.status,
    ].join('|');
    const existing = groups.get(key) ?? [];
    existing.push({ assignment, direction: assignmentDirection });
    groups.set(key, existing);
  }

  return [...groups.entries()].map(([id, members]) => {
    const forward = members.find((member) => member.direction === 'forward')?.assignment ?? null;
    const reverse = members.find((member) => member.direction === 'reverse')?.assignment ?? null;
    const first = members[0].assignment;
    return {
      id,
      assignments: members.map((member) => member.assignment),
      forward,
      reverse,
      directionScope: directionScopeFromDirections(members.map((member) => member.direction)),
      effectiveFrom: first.effective_from,
      effectiveTo: first.effective_to,
      status: first.status,
    };
  });
}

export function directionScopeLabel(scope: DirectionScope) {
  if (scope === 'both') return 'Both directions';
  return scope === 'forward' ? 'Outbound only' : 'Return only';
}

export function resolveReverseStops({
  customizeReturn,
  forwardPickupStopId,
  forwardDropoffStopId,
  reversePickupStopId,
  reverseDropoffStopId,
}: {
  customizeReturn: boolean;
  forwardPickupStopId: string;
  forwardDropoffStopId: string;
  reversePickupStopId: string;
  reverseDropoffStopId: string;
}) {
  return customizeReturn
    ? { pickupStopId: reversePickupStopId, dropoffStopId: reverseDropoffStopId }
    : { pickupStopId: forwardDropoffStopId, dropoffStopId: forwardPickupStopId };
}
