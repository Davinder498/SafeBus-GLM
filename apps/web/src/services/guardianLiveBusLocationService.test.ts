import { describe, expect, it } from 'vitest';
import {
  mapGuardianBusServiceLine,
  mapGuardianBusVisibilityRow,
  type GuardianBusVisibilityRpcRow,
} from '@/services/guardianLiveBusLocationService';

describe('guardian bus-first visibility mapping', () => {
  it('maps the stable bus number separately from the physical license plate', () => {
    const row: GuardianBusVisibilityRpcRow = {
      student_id: 'student-1',
      student_name: 'Avery Johnson',
      student_grade: '4',
      assignment_state: 'assigned',
      bus_number: 'AF01',
      license_plate: 'CPK1656',
      has_active_trip: true,
      location_state: 'fresh',
      latitude: 51.0447,
      longitude: -114.0719,
      location_recorded_at: '2026-08-03T18:00:00.000Z',
      location_age_seconds: 10,
      eta_status: 'available',
      eta_label: 'About 8–12 minutes',
      student_trip_status: 'picked_up',
      pickup_event_time: '2026-08-03T17:45:00.000Z',
      dropoff_event_time: null,
      last_event_time: '2026-08-03T17:45:00.000Z',
    };

    expect(mapGuardianBusVisibilityRow(row)).toMatchObject({
      busNumber: 'AF01',
      licensePlate: 'CPK1656',
      hasActiveTrip: true,
      studentTripStatus: 'picked_up',
    });
  });

  it('represents a linked student without a bus assignment without inventing bus data', () => {
    const row: GuardianBusVisibilityRpcRow = {
      student_id: 'student-2',
      student_name: 'Sam Lee',
      student_grade: null,
      assignment_state: 'unassigned',
      bus_number: null,
      license_plate: null,
      has_active_trip: false,
      location_state: 'inactive',
      latitude: null,
      longitude: null,
      location_recorded_at: null,
      location_age_seconds: null,
      eta_status: 'waiting_for_trip',
      eta_label: 'Waiting for the bus run to start',
      student_trip_status: 'no_active_trip',
      pickup_event_time: null,
      dropoff_event_time: null,
      last_event_time: null,
    };

    expect(mapGuardianBusVisibilityRow(row)).toMatchObject({
      assignmentState: 'unassigned',
      busNumber: null,
      licensePlate: null,
      locationState: 'inactive',
    });
  });

  it('maps ordered guardian service stops without exposing internal identifiers', () => {
    const line = mapGuardianBusServiceLine({
      busNumber: '42',
      licensePlate: 'TEST-42',
      routeName: 'Cedar School Line',
      tripName: 'Morning school run',
      direction: 'forward',
      tripStatus: 'active',
      locationState: 'fresh',
      latitude: 51.047,
      longitude: -114.0719,
      locationRecordedAt: '2026-08-03T18:00:00.000Z',
      stops: [
        {
          name: 'North Terminal',
          order: 1,
          latitude: 51.044,
          longitude: -114.0719,
          plannedArrivalTime: '08:00:00',
        },
        {
          name: 'Riverside School',
          order: 2,
          latitude: 51.056,
          longitude: -114.0719,
          plannedArrivalTime: '08:25:00',
        },
      ],
    });

    expect(line.stops.map((stop) => stop.name)).toEqual([
      'North Terminal',
      'Riverside School',
    ]);
    expect(line).not.toHaveProperty('routeId');
    expect(line).not.toHaveProperty('tripId');
    expect(line).not.toHaveProperty('driverId');
  });
});
