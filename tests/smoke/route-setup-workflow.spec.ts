import { expect, test, type Page } from '@playwright/test';
import { ADMIN_IDS, installAdminWorkflowMock } from './fixtures/admin-workflow';
import { installMapProviderAvailable } from './fixtures/map-provider';

const routeRecord = {
  id: ADMIN_IDS.route,
  tenant_id: ADMIN_IDS.tenant,
  route_name: 'Route One',
  route_code: 'R1',
  route_kind: 'regular',
  service_schedule_mode: 'weekly',
  service_dates: [] as string[],
  map_color: '#2563eb',
  definition_status: 'ready',
  status: 'active',
  school_id: null,
};
const stops = [
  {
    id: 'stop-a',
    route_id: ADMIN_IDS.route,
    stop_name: 'Library',
    stop_order: 1,
    latitude: 51.0447,
    longitude: -114.0719,
    status: 'active',
    school_id: null,
  },
  {
    id: 'stop-b',
    route_id: ADMIN_IDS.route,
    stop_name: 'School',
    stop_order: 2,
    latitude: 51.047,
    longitude: -114.062,
    status: 'active',
    school_id: null,
  },
];
const patterns = (['forward', 'reverse'] as const).map((direction, i) => ({
  id: `pattern-${i}`,
  route_id: ADMIN_IDS.route,
  direction,
  display_name: i ? 'Return' : 'Outbound',
  status: 'active',
  schedule_review_required: false,
}));

async function fixture(
  page: Page,
  options: {
    rejectDriver?: boolean;
    rejectRoster?: boolean;
    rejectDaysOnce?: boolean;
    rejectServices?: boolean;
    rejectEnd?: boolean;
    deleteConflict?: boolean;
    deleteEmpty?: boolean;
  } = {},
) {
  await installAdminWorkflowMock(page);
  await installMapProviderAvailable(page);
  let record = { ...routeRecord };
  let services: Array<Record<string, unknown>> = [];
  let assignments: Array<Record<string, unknown>> = [];
  let students: Array<Record<string, unknown>> = [];
  const writes: Array<{ name: string; args: Record<string, unknown> }> = [];
  let daysRejected = false;
  await page.route('**/rest/v1/**', async (request) => {
    const name = new URL(request.request().url()).pathname.split('/').at(-1)!;
    const method = request.request().method();
    const args = ['POST', 'PATCH'].includes(method) ? request.request().postDataJSON() : {};
    const reply = (data: unknown, status = 200) =>
      request.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    switch (name) {
      case 'routes':
        if (method === 'DELETE') {
          writes.push({
            name: 'delete_route',
            args: { id: new URL(request.request().url()).searchParams.get('id') },
          });
          if (options.deleteConflict)
            return reply({ code: '23503', message: 'History reference' }, 409);
          return reply(options.deleteEmpty ? [] : [{ id: record.id }]);
        }
        if (method === 'PATCH') {
          writes.push({ name: 'update_route', args });
          record = { ...record, ...args };
          return reply(record);
        }
        return reply([record]);
      case 'get_admin_paginated_list':
        return reply({ rows: [record], totalCount: 1, page: 1, pageSize: 50 });
      case 'route_stops':
        return reply(stops);
      case 'route_trip_patterns':
        return reply(patterns);
      case 'route_trip_stop_schedules':
        return reply([]);
      case 'route_service_days':
        return reply(
          [1, 2, 3, 4, 5].map((day_of_week) => ({
            route_id: ADMIN_IDS.route,
            day_of_week,
            status: 'active',
          })),
        );
      case 'driver_route_assignments':
        if (method === 'PATCH') {
          writes.push({ name: 'update_driver_plan', args });
          assignments = assignments.map((a) => ({ ...a, ...args }));
          return reply(assignments[0]);
        }
        return reply(assignments);
      case 'get_admin_bus_services_with_capacity':
        if (options.rejectServices) return reply({ message: 'Service read denied' }, 403);
        return reply(services);
      case 'get_admin_route_shape_versions':
        return reply([]);
      case 'get_admin_bus_workspace':
        return options.rejectRoster
          ? reply({ message: 'Denied' }, 403)
          : reply({
              studentAssignments: students,
              driverAssignments: assignments,
              routeAssignments: services,
            });
      case 'search_admin_students':
        return reply([{ id: 'student-one', label: 'Alex Test', school_name: null }]);
      case 'admin_save_route_definition':
        writes.push({ name, args });
        if (options.rejectDaysOnce && !daysRejected) {
          daysRejected = true;
          return reply({ message: 'Calendar could not be saved.' }, 503);
        }
        record = {
          ...record,
          route_name: args.p_route.routeName,
          service_schedule_mode: args.p_route.serviceMode,
          service_dates: args.p_route.serviceDates,
        };
        return reply({ routeId: ADMIN_IDS.route, definitionStatus: 'ready', activeStopCount: 2 });
      case 'admin_set_bus_route_service':
        writes.push({ name, args });
        services = patterns
          .filter(
            (p) => args.p_direction_scope === 'both' || args.p_direction_scope === p.direction,
          )
          .map((p) => ({
            id: `service-${p.direction}`,
            bus_id: ADMIN_IDS.bus,
            bus_number: 'One',
            route_id: ADMIN_IDS.route,
            route_name: record.route_name,
            route_code: 'R1',
            route_trip_pattern_id: p.id,
            trip_name: p.display_name,
            direction: p.direction,
            trip_type: p.direction === 'forward' ? 'morning' : 'evening',
            status: 'active',
            effective_from: args.p_effective_from,
            effective_to: args.p_effective_to,
          }));
        return reply(services);
      case 'admin_set_driver_bus_assignment':
        writes.push({ name, args });
        if (options.rejectDriver) return reply({ code: '23P01', message: 'Conflict' }, 409);
        assignments = [
          ...assignments.filter((a) => a.id !== args.p_existing_assignment_id),
          {
            id: 'driver-plan',
            bus_route_assignment_id: args.p_bus_route_assignment_id,
            driver_id: args.p_driver_id,
            route_id: ADMIN_IDS.route,
            bus_id: ADMIN_IDS.bus,
            status: 'active',
            effective_from: args.p_effective_from,
            effective_to: args.p_effective_to,
          },
        ];
        return reply(assignments.at(-1));
      case 'admin_end_bus_route_service':
        writes.push({ name, args });
        if (options.rejectEnd)
          return reply(
            { code: '55006', message: 'End the active bus run before ending this route service.' },
            409,
          );
        services = services.map((s) =>
          args.p_assignment_ids.includes(s.id) ? { ...s, status: 'inactive' } : s,
        );
        return reply({ busRouteAssignmentIds: args.p_assignment_ids });
      case 'admin_set_student_bus_service_status':
        writes.push({ name, args });
        students = students.map((s) =>
          args.p_assignment_ids.includes(s.id) ? { ...s, status: args.p_status } : s,
        );
        return reply(students);
      case 'admin_set_student_bus_service_with_seat':
        writes.push({ name, args });
        students = services.map((s) => ({
          id: `student-${s.id}`,
          student_id: args.p_student_id,
          student_name: 'Alex Test',
          bus_route_assignment_id: s.id,
          route_trip_pattern_id: s.route_trip_pattern_id,
          pickup_stop_id:
            s.direction === 'forward'
              ? args.p_forward_pickup_stop_id
              : args.p_reverse_pickup_stop_id,
          dropoff_stop_id:
            s.direction === 'forward'
              ? args.p_forward_dropoff_stop_id
              : args.p_reverse_dropoff_stop_id,
          pickup_stop_name: s.direction === 'forward' ? 'Library' : 'School',
          dropoff_stop_name: s.direction === 'forward' ? 'School' : 'Library',
          effective_from: args.p_effective_from,
          effective_to: args.p_effective_to,
          status: 'active',
        }));
        return reply(students);
      default:
        return request.fallback();
    }
  });
  return writes;
}

async function open(page: Page, capture = false) {
  await page.goto('/admin/routes');
  const card = page.getByRole('link', { name: 'Open route Route One', exact: true });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Set up route', exact: true })).toHaveCount(0);
  if (capture)
    await page.screenshot({
      path: test.info().outputPath('route-list.png'),
      animations: 'disabled',
    });
  await page.getByRole('link', { name: 'Open route Route One', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Route setup', exact: true })).toBeVisible();
}
async function assignBus(page: Page) {
  await page.getByRole('button', { name: 'Assignments', exact: true }).click();
  const section = page.locator('#route-service');
  await section.getByRole('button', { name: 'Assign bus to route', exact: true }).click();
  await section.getByRole('combobox', { name: 'Bus', exact: true }).selectOption(ADMIN_IDS.bus);
  await section.getByLabel('Effective from', { exact: true }).fill('2026-10-01');
  await section.getByRole('button', { name: 'Assign bus', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Driver for Outbound bus One' })).toBeVisible();
}

test('route setup offers safe creation returns without assigning records automatically', async ({
  page,
}) => {
  const writes = await fixture(page);
  await open(page);
  await expect(page.getByTestId('route-readiness-overview')).toBeVisible();
  await page.getByRole('button', { name: 'Assignments', exact: true }).click();
  const section = page.locator('#route-service');
  const addBus = section.getByRole('link', { name: 'Add new bus', exact: true });
  const busUrl = new URL((await addBus.getAttribute('href'))!, 'https://safebus.example');
  expect(busUrl.pathname).toBe('/admin/buses/new');
  const busReturn = new URL(busUrl.searchParams.get('returnTo')!);
  expect(busReturn.pathname).toBe(`/admin/routes/${ADMIN_IDS.route}`);
  expect(busReturn.hash).toBe('#route-service');
  expect(writes).toHaveLength(0);

  await assignBus(page);
  const addDriver = section.getByRole('link', { name: 'Add new driver for Outbound' });
  await expect(addDriver).toBeVisible();
  const inviteUrl = new URL((await addDriver.getAttribute('href'))!, 'https://safebus.example');
  expect(inviteUrl.pathname).toBe('/admin/drivers');
  expect(inviteUrl.searchParams.get('invite')).toBe('1');
  const driverReturn = new URL(inviteUrl.searchParams.get('returnTo')!);
  expect(driverReturn.pathname).toBe(`/admin/routes/${ADMIN_IDS.route}`);
  expect(driverReturn.searchParams.get('service')).toBe('service-forward');
  expect(driverReturn.hash).toBe('#route-service');
  expect(writes.map((write) => write.name)).toEqual(['admin_set_bus_route_service']);
});

test('sets up route details, bus, driver and student stops without leaving the route', async ({
  page,
}, info) => {
  const writes = await fixture(page);
  await open(page, true);
  await page.getByRole('button', { name: 'Route & Stops', exact: true }).click();
  await page.getByRole('button', { name: 'Edit route details and stops' }).click();
  await page.getByLabel('Route name', { exact: true }).fill('North School');
  await expect(page.locator('#route-details input[type=date]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save route definition' }).click();
  await expect(page.getByRole('heading', { name: 'North School', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit road path', exact: true }).click();
  await expect(page.getByTestId('route-path-editor')).toBeVisible();
  await assignBus(page);
  const driver = page.getByRole('form', { name: 'Driver for Outbound bus One' });
  await driver
    .getByRole('combobox', { name: 'Driver', exact: true })
    .selectOption(ADMIN_IDS.driver);
  await driver.getByRole('button', { name: 'Save driver and dates' }).click();
  await expect(driver.getByRole('status')).toContainText('saved');
  await driver.getByLabel('Service ends (optional)').fill('2027-06-30');
  await driver.getByRole('button', { name: 'Save driver and dates' }).click();
  await expect
    .poll(() => writes.filter((w) => w.name === 'admin_set_driver_bus_assignment').length)
    .toBe(2);
  expect(
    writes.filter((w) => w.name === 'admin_set_driver_bus_assignment').at(-1)?.args
      .p_existing_assignment_id,
  ).toBe('driver-plan');
  await expect(page.locator('#route-review')).toContainText('1 of 2');
  await page.getByRole('button', { name: 'Students', exact: true }).click();
  await page.getByRole('button', { name: 'Assign student to route', exact: true }).click();
  const section = page.locator('#route-students');
  await section.getByRole('searchbox', { name: 'Search students' }).fill('Alex');
  await section.getByRole('button', { name: 'Alex Test', exact: true }).click();
  await section.getByRole('combobox', { name: 'Pickup stop', exact: true }).selectOption('stop-a');
  await section
    .getByRole('combobox', { name: 'Drop-off stop', exact: true })
    .selectOption('stop-b');
  await section.getByRole('button', { name: 'Assign student', exact: true }).click();
  await expect(section.getByText('Alex Test', { exact: true })).toBeVisible();
  expect(writes.find((w) => w.name === 'admin_save_route_definition')?.args.p_route).toMatchObject({
    id: ADMIN_IDS.route,
    routeName: 'North School',
  });
  expect(
    writes.find((w) => w.name === 'admin_set_student_bus_service_with_seat')?.args,
  ).toMatchObject({
    p_route_id: ADMIN_IDS.route,
    p_bus_id: ADMIN_IDS.bus,
    p_forward_pickup_stop_id: 'stop-a',
    p_reverse_pickup_stop_id: 'stop-b',
  });
  await expect(page).toHaveURL(new RegExp(`/admin/routes/${ADMIN_IDS.route}`));
  await page.getByRole('button', { name: 'Student service actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit student service', exact: true }).click();
  await section.getByLabel('Effective to (optional)').fill('2027-06-30');
  await section.getByRole('button', { name: 'Update assignment' }).click();
  expect(
    writes.filter((w) => w.name === 'admin_set_student_bus_service_with_seat').at(-1)?.args
      .p_existing_assignment_ids,
  ).toEqual(['student-service-forward', 'student-service-reverse']);
  await page.getByRole('button', { name: 'Assignments', exact: true }).click();
  await page.locator('#route-service').screenshot({ path: info.outputPath('route-service.png') });
  await page.getByRole('button', { name: 'Students', exact: true }).click();
  await section.getByRole('button', { name: 'Student service actions' }).click();
  await section.getByRole('menuitem', { name: 'End student service' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End service', exact: true }).click();
  await expect(section.getByText('Service status: inactive')).toBeVisible();
  expect(writes.find((w) => w.name === 'admin_set_student_bus_service_status')?.args).toMatchObject(
    {
      p_assignment_ids: ['student-service-forward', 'student-service-reverse'],
      p_status: 'inactive',
      p_end_service: true,
    },
  );
  await page.getByRole('button', { name: 'Assignments', exact: true }).click();
  await page.getByRole('button', { name: 'Edit driver', exact: true }).first().click();
  await page.getByRole('form', { name: 'Driver for Outbound bus One' }).getByRole('button', { name: 'Remove driver plan', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove driver plan', exact: true })
    .click();
  await page.getByRole('button', { name: 'Assignments', exact: true }).click();
  await expect(page.locator('#route-review')).toContainText('0 of 2');
});

test('route removal confirms intent and explains protected history', async ({ page }) => {
  const writes = await fixture(page, { deleteConflict: true });
  await open(page);
  await expect(page.getByRole('link', { name: 'Manage route' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Route actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete route' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Route actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete route' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete route', exact: true }).click();
  await expect(page.getByText(/has saved road paths or operational history/)).toBeVisible();
  await expect(page).toHaveURL(`/admin/routes/${ADMIN_IDS.route}`);
  expect(writes[0].args.id).toBe(`eq.${ADMIN_IDS.route}`);
});

test('empty deletion result is never reported as a successful deletion', async ({ page }) => {
  await fixture(page, { deleteEmpty: true });
  await open(page);
  await page.getByRole('button', { name: 'Route actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete route' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete route', exact: true }).click();
  await expect(
    page.getByText('This route was not deleted. Reload and check your access.'),
  ).toBeVisible();
  await expect(page).toHaveURL(`/admin/routes/${ADMIN_IDS.route}`);
});

test('legacy manage link opens the route detail page and unused route deletion returns to the list', async ({
  page,
}) => {
  const writes = await fixture(page);
  await page.goto(`/admin/routes/${ADMIN_IDS.route}/manage`);
  await expect(page).toHaveURL(`/admin/routes/${ADMIN_IDS.route}#route-details`);
  await expect(page.getByLabel('Route name', { exact: true })).toHaveValue('Route One');
  await page.getByRole('button', { name: 'Route actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete route' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete route', exact: true }).click();
  await expect(page).toHaveURL('/admin/routes');
  expect(writes).toEqual([{ name: 'delete_route', args: { id: `eq.${ADMIN_IDS.route}` } }]);
});

test('archives a route without deleting its history', async ({ page }) => {
  const writes = await fixture(page);
  await open(page);
  await page.getByRole('button', { name: 'Route actions' }).click();
  await page.getByRole('menuitem', { name: 'Archive route' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Archive route', exact: true })
    .click();
  await expect(page).toHaveURL('/admin/routes');
  expect(writes).toEqual([{ name: 'update_route', args: { status: 'archived' } }]);
});

test('ending bus service respects the active run rejection', async ({ page }) => {
  const writes = await fixture(page, { rejectEnd: true });
  await open(page);
  await assignBus(page);
  await page.getByRole('button', { name: 'Route actions' }).click();
  await page.getByRole('menuitem', { name: 'Archive route' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Archive route', exact: true })
    .click();
  await expect(page.getByText(/End this route’s active bus service assignments/)).toBeVisible();
  expect(writes.filter((w) => w.name === 'update_route')).toHaveLength(0);
  await page.getByRole('button', { name: 'Assignments', exact: true }).click();
  await page.getByRole('button', { name: 'Bus One: Outbound', exact: true }).click();
  await page.getByRole('menuitem', { name: 'End bus service' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End service', exact: true }).click();
  await expect(
    page.getByText('End the active bus run before ending this route service.'),
  ).toBeVisible();
  await expect(page.getByRole('form', { name: 'Driver for Outbound bus One' })).toBeVisible();
  expect(writes.find((w) => w.name === 'admin_end_bus_route_service')?.args).toEqual({
    p_assignment_ids: ['service-forward'],
  });
});

test('a rejected driver save preserves the saved bus and does not claim setup is complete', async ({
  page,
}) => {
  const writes = await fixture(page, { rejectDriver: true });
  await open(page);
  await assignBus(page);
  const driver = page.getByRole('form', { name: 'Driver for Outbound bus One' });
  await driver
    .getByRole('combobox', { name: 'Driver', exact: true })
    .selectOption(ADMIN_IDS.driver);
  await driver.getByRole('button', { name: 'Save driver and dates' }).click();
  await expect(driver.getByRole('alert')).toContainText('already has a planned driver');
  await expect(page.locator('#route-review')).toContainText('0 of 2');
  await driver.getByRole('button', { name: 'Save driver and dates' }).click();
  expect(writes.filter((w) => w.name === 'admin_set_bus_route_service')).toHaveLength(1);
  expect(writes.filter((w) => w.name === 'admin_set_driver_bus_assignment')).toHaveLength(2);
});

test('edits bus dates against the existing service id', async ({ page }) => {
  const writes = await fixture(page);
  await open(page);
  await assignBus(page);
  const section = page.locator('#route-service');
  await section.getByRole('button', { name: 'Bus One: Outbound', exact: true }).click();
  await section.getByRole('menuitem', { name: 'Edit bus service: Outbound' }).click();
  await section.getByLabel('Effective to', { exact: true }).fill('2027-06-30');
  await section.getByRole('button', { name: 'Save bus service', exact: true }).click();
  expect(writes.filter((w) => w.name === 'admin_set_bus_route_service').at(-1)?.args).toMatchObject(
    {
      p_existing_assignment_ids: ['service-forward'],
      p_direction_scope: 'forward',
      p_effective_to: '2027-06-30',
    },
  );
});

test('failed roster loading blocks student edits and keeps review unverified', async ({ page }) => {
  await fixture(page, { rejectRoster: true });
  await open(page);
  await assignBus(page);
  await page.getByRole('button', { name: 'Students', exact: true }).click();
  await expect(page.locator('#route-students').getByRole('alert')).toContainText(
    'could not be loaded',
  );
  await expect(page.getByRole('button', { name: 'Assign student to route' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByTestId('route-readiness-overview')).toContainText('Not verified');
});

test('retrying a failed atomic route save preserves inputs and creates once', async ({ page }) => {
  const writes = await fixture(page, { rejectDaysOnce: true });
  await page.goto('/admin/routes');
  await page.getByRole('link', { name: 'Add route', exact: true }).click();
  await page.getByLabel('Route name', { exact: true }).fill('New route');
  await page.getByLabel('Route code', { exact: true }).fill('NEW');
  for (const [name, latitude, longitude] of [
    ['Library', '51.0447', '-114.0719'],
    ['School', '51.047', '-114.062'],
  ]) {
    await page.getByRole('button', { name: 'Add stop', exact: true }).click();
    await page.getByLabel('Stop name', { exact: true }).fill(name);
    await page.getByLabel('Latitude', { exact: true }).fill(latitude);
    await page.getByLabel('Longitude', { exact: true }).fill(longitude);
    await page.getByRole('button', { name: 'Save stop details' }).click();
  }
  await page.getByRole('button', { name: 'Save route definition' }).click();
  await expect(page.getByText('Calendar could not be saved.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Save route definition' }).click();
  await expect(page).toHaveURL(`/admin/routes/${ADMIN_IDS.route}#setup`);
  await expect(page.getByRole('heading', { name: 'New route', exact: true })).toBeVisible();
  await expect(page.getByTestId('route-setup')).toBeVisible();
  const routeWrites = writes.filter((w) => w.name === 'admin_save_route_definition');
  expect(routeWrites).toHaveLength(2);
  expect(routeWrites[0].args.p_route).not.toHaveProperty('id');
  expect(routeWrites[1].args.p_route).not.toHaveProperty('id');
  expect(routeWrites[1].args).toEqual(routeWrites[0].args);
});

test('a failed service read blocks setup until a successful reload', async ({ page }) => {
  const options = { rejectServices: true };
  const writes = await fixture(page, options);
  await page.goto(`/admin/routes/${ADMIN_IDS.route}`);
  await expect(page.getByText('Route unavailable', { exact: true })).toBeVisible();
  await expect(page.getByTestId('route-setup')).toHaveCount(0);
  expect(writes).toHaveLength(0);
  options.rejectServices = false;
  await page.getByRole('button', { name: 'Retry route loading' }).click();
  await expect(page.getByTestId('route-setup')).toBeVisible();
});

test('regular routes can use exact weekend dates and reject an empty active date list', async ({
  page,
}) => {
  const writes = await fixture(page);
  await page.goto(`/admin/routes/${ADMIN_IDS.route}`);
  await page.getByRole('button', { name: 'Route & Stops', exact: true }).click();
  await page.getByRole('button', { name: 'Edit route details and stops' }).click();
  await page.getByRole('combobox', { name: 'Schedule', exact: true }).selectOption('dates');
  await page.getByRole('button', { name: 'Save route definition' }).click();
  await expect(
    page.getByText('Select at least one valid service date', { exact: false }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  for (const date of ['2026-11-08', '2026-11-01']) {
    await page.getByLabel('Service date', { exact: true }).fill(date);
    await page.getByRole('button', { name: 'Add date', exact: true }).click();
  }
  await page.getByLabel('Service date', { exact: true }).fill('2026-11-08');
  await expect(page.getByRole('button', { name: 'Add date', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove service date 2026-11-01' }).click();
  await page.getByRole('button', { name: 'Save route definition' }).click();
  await expect(page.getByText('Route details, stops and service calendar saved.')).toBeVisible();
  expect(writes[0].args.p_route).toMatchObject({
    routeKind: 'regular',
    serviceMode: 'dates',
    serviceDates: ['2026-11-08'],
  });
  await page.getByText('Specific dates (1)', { exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: '2026-11-08' })).toBeVisible();
});

test('an administrator can close every weekday without switching route status', async ({
  page,
}) => {
  const writes = await fixture(page);
  await page.goto(`/admin/routes/${ADMIN_IDS.route}`);
  await page.getByRole('button', { name: 'Route & Stops', exact: true }).click();
  await page.getByRole('button', { name: 'Edit route details and stops' }).click();
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    await page.getByRole('checkbox', { name: day, exact: true }).uncheck();
  await expect(
    page.getByText('This route is closed for new trips on every weekday.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save route definition' }).click();
  await expect(page.getByText('Route details, stops and service calendar saved.')).toBeVisible();
  expect(writes[0].args.p_route).toMatchObject({
    status: 'active',
    serviceMode: 'weekly',
    serviceDays: [],
  });
});
