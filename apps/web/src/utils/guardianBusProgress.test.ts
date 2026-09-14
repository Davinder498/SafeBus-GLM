import { describe, expect, it } from 'vitest';
import type { GuardianBusServiceStop } from '@/types/guardianLiveBusLocation';
import { calculateGuardianBusProgress } from './guardianBusProgress';

function stop(
  name: string,
  order: number,
  latitude: number | null,
  longitude: number | null,
): GuardianBusServiceStop {
  return { name, order, latitude, longitude, plannedArrivalTime: null };
}

describe('calculateGuardianBusProgress', () => {
  const stops = [
    stop('Start', 1, 51, -114),
    stop('Middle', 2, 51.01, -114),
    stop('End', 3, 51.02, -114),
  ];

  it('projects a bus onto the matching schematic stop interval', () => {
    expect(calculateGuardianBusProgress(stops, 51.005, -114)).toBeCloseTo(25, 4);
    expect(calculateGuardianBusProgress(stops, 51.015, -114)).toBeCloseTo(75, 4);
  });

  it('clamps positions before the start and after the end', () => {
    expect(calculateGuardianBusProgress(stops, 50.9, -114)).toBe(0);
    expect(calculateGuardianBusProgress(stops, 51.1, -114)).toBe(100);
  });

  it('uses located stop indexes while retaining unlocated intermediate stops', () => {
    const partiallyLocated = [
      stop('Start', 1, 51, -114),
      stop('Unmapped', 2, null, null),
      stop('End', 3, 51.02, -114),
    ];
    expect(calculateGuardianBusProgress(partiallyLocated, 51.01, -114)).toBeCloseTo(50, 4);
  });

  it('returns null without enough safe coordinates', () => {
    expect(calculateGuardianBusProgress([stops[0]], 51, -114)).toBeNull();
    expect(calculateGuardianBusProgress(stops, null, -114)).toBeNull();
  });
});
