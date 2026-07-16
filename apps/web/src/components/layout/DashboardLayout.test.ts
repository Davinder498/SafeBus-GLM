import { describe, expect, it } from 'vitest';
import { adminNavItems } from './DashboardLayout';

const tenantAdminRoutes = [
  '/admin',
  '/admin/trips',
  '/admin/live-trips',
  '/admin/routes',
  '/admin/buses',
  '/admin/drivers',
  '/admin/students',
  '/admin/assignments',
  '/admin/driver-assignments',
  '/admin/guardians',
  '/admin/schools',
  '/admin/users',
  '/admin/settings',
];

describe('tenant admin shell navigation model', () => {
  it('uses only implemented tenant-admin destinations', () => {
    expect(adminNavItems.map((item) => item.to)).toEqual(tenantAdminRoutes);
  });

  it('groups destinations around operations, transportation, people, and management', () => {
    expect(new Set(adminNavItems.map((item) => item.group))).toEqual(
      new Set(['operations', 'transportation', 'people', 'management']),
    );
  });
});
