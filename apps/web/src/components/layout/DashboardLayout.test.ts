import { describe, expect, it } from 'vitest';
import { adminNavItems, driverNavGroups, guardianNavGroups } from './DashboardLayout';

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
});
