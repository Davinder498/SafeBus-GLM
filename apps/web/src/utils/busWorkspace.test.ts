import { describe, expect, it } from 'vitest';
import { busWorkspaceLifecycle, safeBusWorkspaceReturn } from '@/utils/busWorkspace';

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
