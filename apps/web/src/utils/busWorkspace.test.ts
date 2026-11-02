import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  busAssignmentEffectiveStatus,
  busAssignmentEndDate,
  busWorkspaceLifecycle,
  safeBusWorkspaceReturn,
} from '@/utils/busWorkspace';

afterEach(() => vi.useRealTimers());

it.each([
  ['2026-01-16T01:00:00Z', '2026-01-15'],
  ['2026-07-16T01:00:00Z', '2026-07-15'],
  ['2026-11-03T01:00:00Z', '2026-11-02'],
  ['2026-11-02T06:30:00Z', '2026-11-02'],
])('uses Alberta dates for current, upcoming and end-date defaults at %s', (instant, day) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instant));
  const endsToday = { status: 'active', effective_from: '2025-01-01', effective_to: day };
  const startsNextUtcDay = {
    status: 'active',
    effective_from: new Date(instant).toISOString().slice(0, 10),
    effective_to: null,
  };
  expect(busWorkspaceLifecycle(endsToday)).toBe('current');
  expect(busAssignmentEffectiveStatus(endsToday)).toBe('active');
  expect(busAssignmentEndDate({ effective_from: '2025-01-01', effective_to: null })).toBe(day);
  if (startsNextUtcDay.effective_from > day) {
    expect(busWorkspaceLifecycle(startsNextUtcDay)).toBe('upcoming');
    expect(busAssignmentEffectiveStatus(startsNextUtcDay)).toBe('scheduled');
  }
});

it('moves plans to history exactly at Alberta midnight', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const plan = { status: 'active', effective_from: '2026-11-02', effective_to: '2026-11-02' };
  vi.setSystemTime(new Date('2026-11-03T05:59:59Z'));
  expect(busWorkspaceLifecycle(plan)).toBe('current');
  vi.setSystemTime(new Date('2026-11-03T06:00:00Z'));
  expect(busWorkspaceLifecycle(plan)).toBe('history');
  expect(busAssignmentEffectiveStatus(plan)).toBe('expired');
});

describe('bus workspace assignment lifecycle', () => {
  const currentDate = '2026-07-25';

  it('separates current, upcoming, and historical assignments', () => {
    expect(
      busWorkspaceLifecycle(
        { status: 'active', effective_from: '2026-07-01', effective_to: null },
        currentDate,
      ),
    ).toBe('current');
    expect(
      busWorkspaceLifecycle(
        { status: 'active', effective_from: '2026-08-01', effective_to: null },
        currentDate,
      ),
    ).toBe('upcoming');
    expect(
      busWorkspaceLifecycle(
        { status: 'active', effective_from: '2026-06-01', effective_to: '2026-07-01' },
        currentDate,
      ),
    ).toBe('history');
    expect(
      busWorkspaceLifecycle(
        { status: 'inactive', effective_from: '2026-08-01', effective_to: null },
        currentDate,
      ),
    ).toBe('history');
  });

  it('reports the effective status instead of showing expired active records as active', () => {
    expect(
      busAssignmentEffectiveStatus(
        { status: 'active', effective_from: '2026-06-01', effective_to: '2026-07-01' },
        currentDate,
      ),
    ).toBe('expired');
    expect(
      busAssignmentEffectiveStatus(
        { status: 'active', effective_from: '2026-08-01', effective_to: null },
        currentDate,
      ),
    ).toBe('scheduled');
    expect(
      busAssignmentEffectiveStatus(
        { status: 'inactive', effective_from: '2026-06-01', effective_to: '2026-07-01' },
        currentDate,
      ),
    ).toBe('inactive');
  });

  it('preserves an earlier historical end date when closing or archiving an assignment', () => {
    expect(
      busAssignmentEndDate(
        { effective_from: '2026-06-01', effective_to: '2026-07-01' },
        currentDate,
      ),
    ).toBe('2026-07-01');
    expect(
      busAssignmentEndDate(
        { effective_from: '2026-06-01', effective_to: '2026-12-01' },
        currentDate,
      ),
    ).toBe(currentDate);
    expect(
      busAssignmentEndDate({ effective_from: '2026-08-01', effective_to: null }, currentDate),
    ).toBe('2026-08-01');
  });
});

describe('bus workspace driver return navigation', () => {
  const origin = 'https://safebus.example';

  it('accepts only an internal bus Drivers-tab return', () => {
    expect(safeBusWorkspaceReturn('/admin/buses/bus-1?tab=drivers&service=service-1', origin)).toBe(
      '/admin/buses/bus-1?tab=drivers&service=service-1',
    );
    expect(safeBusWorkspaceReturn('/admin/buses/bus-1?tab=students', origin)).toBeNull();
    expect(
      safeBusWorkspaceReturn('https://attacker.example/admin/buses/bus-1?tab=drivers', origin),
    ).toBeNull();
    expect(safeBusWorkspaceReturn('/admin/drivers?tab=drivers', origin)).toBeNull();
  });
});
