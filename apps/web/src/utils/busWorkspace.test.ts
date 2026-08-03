import { describe, expect, it } from 'vitest';
import {
  busAssignmentEffectiveStatus,
  busAssignmentEndDate,
  busWorkspaceLifecycle,
  safeBusWorkspaceReturn,
} from '@/utils/busWorkspace';

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
