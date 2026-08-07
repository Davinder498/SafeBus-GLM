import { describe, expect, it } from 'vitest';
import { Bus, Calendar, History, LayoutDashboard, List, MapPinned, Settings } from 'lucide-react';
import type { ReactElement } from 'react';
import {
  adminNavItems,
  driverNativeNavItems,
  driverNavGroups,
  getDashboardNavigationMode,
  guardianNativeNavItems,
  guardianNavGroups,
  type DashboardNavItem,
} from './DashboardLayout';

function expectNativeItem(
  item: DashboardNavItem,
  expected: { label: string; to: string; icon: ReactElement['type'] },
) {
  expect(item.label).toBe(expected.label);
  expect(item.to).toBe(expected.to);
  expect((item.icon as ReactElement).type).toBe(expected.icon);
}

const tenantAdminRoutes = [
  '/admin',
  '/admin/live-trips',
  '/admin/routes',
  '/admin/buses',
  '/admin/drivers',
  '/admin/students',
  '/admin/assignments',
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

  it('consolidates live fleet monitoring and trip history into one operations destination', () => {
    const operationItems = adminNavItems.filter((item) => item.group === 'operations');
    expect(operationItems.map(({ label, to }) => [label, to])).toEqual([
      ['Overview', '/admin'],
      ['Live Operations', '/admin/live-trips'],
    ]);
  });

  it('keeps drivers, students, and guardians together under People', () => {
    const peopleItems = adminNavItems
      .filter((item) => item.group === 'people')
      .map((item) => item.label);
    expect(peopleItems).toEqual(['Drivers', 'Students', 'Guardians']);
  });
});

describe('driver shell navigation model', () => {
  it('uses the driver-facing bus scan, history, pickup and drop-off, settings, and profile destinations', () => {
    expect(
      driverNavGroups.flatMap((group) => group.items).map(({ label, to }) => [label, to]),
    ).toEqual([
      ['Scan bus', '/driver'],
      ['Trip history', '/driver/history'],
      ['Pickup & drop-off', '/driver/pickup-drop-off'],
      ['Settings', '/driver/settings'],
      ['Profile', '/driver/profile'],
    ]);
  });

  it('uses four daily-workflow tabs in the native app', () => {
    const expected = [
      { label: 'Scan', to: '/driver', icon: Bus },
      { label: 'Riders', to: '/driver/pickup-drop-off', icon: List },
      { label: 'History', to: '/driver/history', icon: History },
      { label: 'Settings', to: '/driver/settings', icon: Settings },
    ];

    expect(driverNativeNavItems).toHaveLength(expected.length);
    driverNativeNavItems.forEach((item, index) => expectNativeItem(item, expected[index]));
  });
});

describe('guardian shell navigation model', () => {
  it('uses bus-first language and does not expose routes as a guardian destination', () => {
    expect(
      guardianNavGroups.flatMap((group) => group.items).map(({ label, to }) => [label, to]),
    ).toEqual([
      ['Home', '/parent'],
      ['Live map', '/guardian/live-map'],
      ['Bus status', '/guardian/live'],
      ['My buses', '/guardian/routes'],
      ['Pickup & drop-off', '/guardian/events'],
    ]);
  });

  it('uses four bus-first tabs in the native app', () => {
    const expected = [
      { label: 'Home', to: '/parent', icon: LayoutDashboard },
      { label: 'Map', to: '/guardian/live-map', icon: MapPinned },
      { label: 'Buses', to: '/guardian/routes', icon: Bus },
      { label: 'Updates', to: '/guardian/events', icon: Calendar },
    ];

    expect(guardianNativeNavItems).toHaveLength(expected.length);
    guardianNativeNavItems.forEach((item, index) => expectNativeItem(item, expected[index]));
  });
});

describe('dashboard navigation presentation', () => {
  it('keeps the sidebar and drawer as the default web presentation', () => {
    expect(getDashboardNavigationMode('web', 'driver')).toBe('sidebar');
    expect(getDashboardNavigationMode('web', 'parent')).toBe('sidebar');
    expect(getDashboardNavigationMode('web', 'admin')).toBe('sidebar');
  });

  it('uses bottom tabs only for native driver and guardian portals', () => {
    expect(getDashboardNavigationMode('native-mobile', 'driver')).toBe('bottom-tabs');
    expect(getDashboardNavigationMode('native-mobile', 'parent')).toBe('bottom-tabs');
    expect(getDashboardNavigationMode('native-mobile', 'admin')).toBe('sidebar');
  });
});
