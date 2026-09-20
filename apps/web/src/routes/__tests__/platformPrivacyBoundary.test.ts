import { describe, expect, it } from 'vitest';
import { appRoutes } from '../router';
import { appRoutes as mobileRoutes } from '../../../../mobile/src/routes/router';
import { getDashboardPath, isRoleAllowedOnSurface } from '@/contexts/AuthContext';

function routeAllowsPlatform(path: string) {
  const route = appRoutes.find((candidate) => candidate.path === path);
  return JSON.stringify(route?.element).includes('platform_super_admin');
}

describe('platform privacy boundary routing', () => {
  it('sends platform super admins to the dedicated platform tenant dashboard', () => {
    expect(getDashboardPath('platform_super_admin')).toBe('/admin/tenants');
  });

  it('keeps the website administrative and the mobile app driver/guardian only', () => {
    for (const role of [
      'platform_super_admin',
      'tenant_admin',
      'school_admin',
      'transportation_admin',
    ] as const) {
      expect(isRoleAllowedOnSurface(role, 'web')).toBe(true);
      expect(isRoleAllowedOnSurface(role, 'native-mobile')).toBe(false);
    }

    for (const role of ['driver', 'guardian'] as const) {
      expect(isRoleAllowedOnSurface(role, 'web')).toBe(false);
      expect(isRoleAllowedOnSurface(role, 'native-mobile')).toBe(true);
    }
  });

  it('does not register driver or guardian operational routes on the website', () => {
    const paths = appRoutes.map((route) => route.path);
    expect(paths).toContain('/contact');
    expect(paths).not.toContain('/account');
    expect(paths).not.toContain('/notifications/settings/email');
    expect(paths.some((path) => path?.startsWith('/driver'))).toBe(false);
    expect(paths.some((path) => path === '/parent' || path?.startsWith('/guardian'))).toBe(false);
  });

  it('keeps driver and guardian routes in the mobile app without admin dashboards', () => {
    const paths = mobileRoutes.map((route) => route.path);
    expect(paths).toContain('/driver');
    expect(paths).toContain('/parent');
    expect(paths).toContain('/guardian/routes');
    expect(paths.filter((path) => path?.startsWith('/admin'))).toEqual(['/admin/*', '/admin']);
  });

  it('allows platform super admins only on the platform tenant route', () => {
    expect(routeAllowsPlatform('/admin/tenants')).toBe(true);
    expect(routeAllowsPlatform('/admin/tenants/:tenantId')).toBe(true);

    for (const path of [
      '/admin',
      '/admin/students',
      '/admin/guardians',
      '/admin/drivers',
      '/admin/buses',
      '/admin/buses/new',
      '/admin/buses/:busId',
      '/admin/routes',
      '/admin/assignments',
      '/admin/trips',
      '/admin/live-trips',
      '/admin/live-fleet',
      '/admin/subscription',
    ]) {
      expect(routeAllowsPlatform(path), `${path} should not allow Platform Super Admin`).toBe(
        false,
      );
    }
  });
});
