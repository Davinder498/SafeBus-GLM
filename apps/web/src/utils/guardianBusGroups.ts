import type { GuardianBusVisibility } from '@/types/guardianLiveBusLocation';

export interface GuardianBusGroup {
  key: string;
  busNumber: string | null;
  licensePlate: string | null;
  hasActiveTrip: boolean;
  students: GuardianBusVisibility[];
  visibility: GuardianBusVisibility;
}

const locationPriority: Record<GuardianBusVisibility['locationState'], number> = {
  fresh: 5,
  stale: 4,
  missing: 3,
  invalid: 2,
  inactive: 1,
};

function busKey(bus: GuardianBusVisibility): string {
  const number = bus.busNumber?.trim().toLocaleLowerCase();
  return bus.assignmentState === 'assigned' && number ? `bus:${number}` : `student:${bus.studentId}`;
}

function chooseVisibility(
  current: GuardianBusVisibility,
  candidate: GuardianBusVisibility,
): GuardianBusVisibility {
  const currentPriority = locationPriority[current.locationState];
  const candidatePriority = locationPriority[candidate.locationState];
  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority ? candidate : current;
  }

  const currentTime = current.locationRecordedAt
    ? new Date(current.locationRecordedAt).getTime()
    : 0;
  const candidateTime = candidate.locationRecordedAt
    ? new Date(candidate.locationRecordedAt).getTime()
    : 0;
  return candidateTime > currentTime ? candidate : current;
}

/** Groups linked students by the stable service number returned by the guardian RPC. */
export function groupGuardianBuses(buses: GuardianBusVisibility[]): GuardianBusGroup[] {
  const groups = new Map<string, GuardianBusGroup>();

  for (const bus of buses) {
    const key = busKey(bus);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        busNumber: bus.busNumber,
        licensePlate: bus.licensePlate,
        hasActiveTrip: bus.hasActiveTrip,
        students: [bus],
        visibility: bus,
      });
      continue;
    }

    existing.students.push(bus);
    existing.hasActiveTrip ||= bus.hasActiveTrip;
    existing.licensePlate ??= bus.licensePlate;
    existing.visibility = chooseVisibility(existing.visibility, bus);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    students: [...group.students].sort((a, b) => a.studentName.localeCompare(b.studentName)),
  }));
}

export function guardianBusDetailsPath(busNumber: string): string {
  return `/guardian/buses/${encodeURIComponent(busNumber.trim())}`;
}
