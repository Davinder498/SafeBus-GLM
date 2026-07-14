import { describe, expect, it } from 'vitest';
import { appRoutes } from '../router';
import { getDashboardPath } from '@/contexts/AuthContext';

function routeAllowsPlatform(path: string) {
  const route = appRoutes.find((candidate) => candidate.path === path);
  return JSON.stringify(route?.element).includes('platform_super_admin');
}

describe('platform privacy boundary routing', () => {
  it('sends platform super admins to the dedicated platform tenant dashboard', () => {
    expect(getDashboardPath('platform_super_admin')).toBe('/admin/tenants');
  });

  it('allows platform super admins only on the platform tenant route', () => {
    expect(routeAllowsPlatform('/admin/tenants')).toBe(true);

    for (const path of [
      '/admin',
      '/admin/students',
      '/admin/guardians',
      '/admin/drivers',
      '/admin/buses',
      '/admin/routes',
      '/admin/assignments',
      '/admin/trips',
      '/admin/live-trips',
      '/admin/live-fleet',
      '/admin/driver-assignments',
    ]) {
      expect(routeAllowsPlatform(path), `${path} should not allow Platform Super Admin`).toBe(false);
    }
  });
});
