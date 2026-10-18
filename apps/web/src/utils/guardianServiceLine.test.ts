import { describe, expect, it } from 'vitest';
import type { GuardianBusServiceStop } from '@/types/guardianLiveBusLocation';
import { guardianServicePosition, guardianServiceStops } from './guardianServiceLine';

function stop(name: string, pickup: string[] = [], dropoff: string[] = []): GuardianBusServiceStop {
  return {
    name,
    order: 1,
    latitude: null,
    longitude: null,
    pickupStudentNames: pickup,
    dropoffStudentNames: dropoff,
    plannedArrivalTime: null,
    serviceState: 'upcoming',
    etaStatus: 'unavailable',
    etaMinMinutes: null,
    etaMaxMinutes: null,
    etaLabel: 'ETA unavailable',
  };
}
const route = [
  stop('Start'),
  stop('Other pickup'),
  stop('Shared pickup', ['Avery', 'Morgan']),
  stop('Other school'),
  stop('Avery school', [], ['Avery']),
  stop('Morgan school', [], ['Morgan']),
  stop('Depot'),
];

describe('guardian service line stops', () => {
  it('keeps one shared pickup and both different drop-offs, ending at the final child drop-off', () => {
    const visible = guardianServiceStops(route);
    expect(visible.map(({ stop }) => stop.name)).toEqual([
      'Start',
      'Shared pickup',
      'Avery school',
      'Morgan school',
    ]);
    expect(visible.map(({ routeIndex }) => routeIndex)).toEqual([0, 2, 4, 5]);
    expect(visible[1].stop.pickupStudentNames).toEqual(['Avery', 'Morgan']);
    expect(visible[2].stop).toBe(route[4]);
  });
  it('shows different pickups and combines a shared school without duplicating the start', () => {
    const visible = guardianServiceStops([
      stop('Avery pickup', ['Avery']),
      stop('Unrelated'),
      stop('Morgan pickup', ['Morgan']),
      stop('School', [], ['Avery', 'Morgan']),
      stop('Depot'),
    ]);
    expect(visible.map(({ stop }) => stop.name)).toEqual([
      'Avery pickup',
      'Morgan pickup',
      'School',
    ]);
  });
  it('preserves reverse travel order instead of sorting by stop name or stop order', () => {
    const stops = [...route].reverse().map((row) => ({
      ...row,
      pickupStudentNames: row.dropoffStudentNames,
      dropoffStudentNames: row.pickupStudentNames,
    }));
    expect(guardianServiceStops(stops).map(({ stop }) => stop.name)).toEqual([
      'Depot',
      'Morgan school',
      'Avery school',
      'Shared pickup',
    ]);
  });
  it('retains the route end as a fallback when no assigned drop-off is available', () => {
    expect(
      guardianServiceStops([
        stop('Start'),
        stop('Other'),
        stop('Pickup', ['Avery']),
        stop('End'),
      ]).map(({ stop }) => stop.name),
    ).toEqual(['Start', 'Pickup', 'End']);
    expect(guardianServiceStops([stop('Only stop')])).toHaveLength(1);
    expect(guardianServiceStops([])).toEqual([]);
  });
  it('does not combine distinct route visits just because their names match', () => {
    expect(
      guardianServiceStops([stop('Loop'), stop('Loop', ['Avery']), stop('School', [], ['Avery'])]),
    ).toHaveLength(3);
  });
});

describe('guardian service line projection', () => {
  it('projects across hidden intermediate stops using their full-route indexes', () => {
    const visible = guardianServiceStops(route);
    expect(guardianServicePosition(visible, 0)).toBe(0);
    expect(guardianServicePosition(visible, 1)).toBe(0.5);
    expect(guardianServicePosition(visible, 2)).toBe(1);
    expect(guardianServicePosition(visible, 3)).toBe(1.5);
    expect(guardianServicePosition(visible, 4.5)).toBe(2.5);
  });
  it('clamps after the final assigned drop-off and never invents unavailable progress', () => {
    const visible = guardianServiceStops(route);
    expect(guardianServicePosition(visible, -1)).toBe(0);
    expect(guardianServicePosition(visible, 6)).toBe(3);
    expect(guardianServicePosition(visible, null)).toBeNull();
    expect(guardianServicePosition(visible, Number.NaN)).toBeNull();
    expect(guardianServicePosition([], 1)).toBeNull();
  });
});
