import { describe, expect, it } from 'vitest';
import type { GuardianBusVisibility } from '@/types/guardianLiveBusLocation';
import { groupGuardianBuses } from '@/utils/guardianBusGroups';

function bus(
  studentId: string,
  studentName: string,
  busNumber: string | null,
  overrides: Partial<GuardianBusVisibility> = {},
): GuardianBusVisibility {
  return {
    studentId,
    studentName,
    studentGrade: null,
    assignmentState: busNumber ? 'assigned' : 'unassigned',
    busNumber,
    licensePlate: null,
    hasActiveTrip: false,
    locationState: 'inactive',
    latitude: null,
    longitude: null,
    locationRecordedAt: null,
    locationAgeSeconds: null,
    etaStatus: null,
    etaLabel: null,
    studentTripStatus: 'no_active_trip',
    pickupEventTime: null,
    dropoffEventTime: null,
    lastEventTime: null,
    ...overrides,
  };
}

describe('groupGuardianBuses', () => {
  it('renders one group when linked students share a bus number', () => {
    const groups = groupGuardianBuses([
      bus('student-2', 'Morgan', '12'),
      bus('student-1', 'Alex', '12', { hasActiveTrip: true, locationState: 'fresh' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ busNumber: '12', hasActiveTrip: true });
    expect(groups[0].students.map((student) => student.studentName)).toEqual(['Alex', 'Morgan']);
    expect(groups[0].visibility.studentId).toBe('student-1');
  });

  it('renders separate groups for different buses and unknown assignments', () => {
    const groups = groupGuardianBuses([
      bus('student-1', 'Alex', '12'),
      bus('student-2', 'Morgan', '27'),
      bus('student-3', 'Taylor', null),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.busNumber)).toEqual(['12', '27', null]);
  });
});
