import { expect, test, type Page } from '@playwright/test';
import { ADMIN_IDS, installAdminWorkflowMock } from './fixtures/admin-workflow';
import { installMapProviderAvailable, installMapProviderOutage } from './fixtures/map-provider';

const path = {
  type: 'LineString',
  coordinates: [
    [-114.0719, 51.0447],
    [-114.068, 51.0447],
    [-114.068, 51.047],
    [-114.062, 51.047],
  ],
};
type Version = {
  id: string;
  route_id: string;
  version: number;
  status: string;
  distance_meters: number;
  geojson: typeof path;
  effective_from: string | null;
  effective_to: string | null;
};

async function installPathRpcMock(
  page: Page,
  options: { saved?: boolean; rejectWrite?: boolean; rejectLoad?: boolean } = {},
) {
  let versions: Version[] = options.saved
    ? [
        {
          id: 'saved-shape',
          route_id: ADMIN_IDS.route,
          version: 1,
          status: 'draft',
          distance_meters: 1800,
          geojson: path,
          effective_from: null,
          effective_to: null,
        },
      ]
    : [];
  const writes: Array<{ method: string; args: Record<string, unknown> }> = [];
  await page.route('**/rest/v1/rpc/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (
      ![
        'get_admin_route_shape_versions',
        'admin_create_route_shape_version',
        'admin_publish_route_shape_version',
      ].includes(name ?? '')
    ) {
      await route.fallback();
      return;
    }
    const args = route.request().postDataJSON() as Record<string, unknown>;
    if (name === 'get_admin_route_shape_versions') {
      await route.fulfill({
        status: options.rejectLoad ? 403 : 200,
        contentType: 'application/json',
        body: JSON.stringify(options.rejectLoad ? { message: 'Denied' } : versions),
      });
      return;
    }
    writes.push({ method: name!, args });
    if (options.rejectWrite) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Route write rejected.' }),
      });
      return;
    }
    let version: Version;
    if (name === 'admin_create_route_shape_version') {
      version = {
        id: `shape-${versions.length + 1}`,
        route_id: ADMIN_IDS.route,
        version: versions.length + 1,
        status: 'draft',
        distance_meters: 1800,
        geojson: args.p_geojson as typeof path,
        effective_from: null,
        effective_to: null,
      };
      versions = [...versions, version];
    } else {
      version = {
        ...versions.find((item) => item.id === args.p_route_shape_id)!,
        status: 'published',
        effective_from: '2026-10-06T18:00:00Z',
      };
      versions = versions.map((item) =>
        item.id === version.id
          ? version
          : item.status === 'published'
            ? { ...item, status: 'archived' }
            : item,
      );
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([version]),
    });
  });
  return writes;
}

async function openEditor(page: Page) {
  await page.goto('/admin/routes');
  await page.getByRole('link', { name: 'Open route Route One', exact: true }).click();
  const editor = page.getByTestId('route-path-editor');
  await expect(editor.getByRole('combobox', { name: 'Saved path versions' })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Draw on map' })).toBeEnabled();
  return editor;
}

test('draws and undoes points, imports a curved road, saves a draft and publishes only the reviewed version', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await installAdminWorkflowMock(page);
  await installMapProviderAvailable(page);
  const writes = await installPathRpcMock(page);
  const editor = await openEditor(page);
  await editor.getByRole('button', { name: 'Draw on map' }).click();
  const map = editor.getByTestId('route-path-map');
  await map.click({ position: { x: 150, y: 140 } });
  await map.click({ position: { x: 220, y: 200 } });
  await expect(editor.getByText(/2 path points/)).toBeVisible();
  await editor.getByRole('button', { name: 'Undo last point' }).click();
  await expect(editor.getByText(/1 path points/)).toBeVisible();
  await editor.getByRole('button', { name: 'Finish drawing' }).click();
  await editor.getByText('Import GeoJSON or enter coordinates', { exact: true }).click();
  await editor.getByLabel('Paste GeoJSON', { exact: true }).fill(JSON.stringify(path));
  await editor.getByRole('button', { name: 'Preview imported path' }).click();
  await expect(editor.getByText(/4 path points/)).toBeVisible();
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    editor.getByText('Draft version 1 saved. Review the path before publishing.'),
  ).toBeVisible();
  expect(writes[0]).toEqual({
    method: 'admin_create_route_shape_version',
    args: { p_route_id: ADMIN_IDS.route, p_geojson: path, p_status: 'draft', p_source: 'import' },
  });
  const publish = editor.getByRole('button', { name: 'Publish reviewed path' });
  await expect(publish).toBeDisabled();
  await editor.getByRole('checkbox', { name: /I reviewed/ }).check();
  await expect(publish).toBeEnabled();
  await editor.getByRole('button', { name: 'Undo last point' }).click();
  await expect(publish).toBeDisabled();
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    editor.getByText('Draft version 2 saved. Review the path before publishing.'),
  ).toBeVisible();
  await editor.getByRole('checkbox', { name: /I reviewed/ }).check();
  await publish.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Runs already started will keep their original path.');
  await dialog.getByRole('button', { name: 'Publish path', exact: true }).click();
  await expect(editor.getByText(/Road path version 2 published/)).toBeVisible();
  expect(writes.at(-1)).toEqual({
    method: 'admin_publish_route_shape_version',
    args: { p_route_shape_id: 'shape-2' },
  });
  await editor.screenshot({ path: testInfo.outputPath('road-path-published.png') });
  await page.reload();
  await expect(editor.getByText(/Published path: version 2/)).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Publish reviewed path' })).toHaveCount(0);
  await editor.getByRole('button', { name: 'Undo last point' }).click();
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    editor.getByText('Draft version 3 saved. Review the path before publishing.'),
  ).toBeVisible();
  await expect(editor.getByText(/Published path: version 2/)).toBeVisible();
  expect(writes.at(-1)?.method).toBe('admin_create_route_shape_version');
  expect(writes.at(-1)?.args.p_status).toBe('draft');
});

test('invalid imports and rejected drafts cannot publish or replace the editor path', async ({
  page,
}) => {
  await installAdminWorkflowMock(page);
  await installMapProviderAvailable(page);
  const writes = await installPathRpcMock(page, { rejectWrite: true });
  const editor = await openEditor(page);
  await editor.getByText('Import GeoJSON or enter coordinates', { exact: true }).click();
  await editor.getByLabel('Paste GeoJSON', { exact: true }).fill('{bad json');
  await editor.getByRole('button', { name: 'Preview imported path' }).click();
  await expect(editor.getByRole('alert')).toContainText('valid GeoJSON JSON');
  expect(writes).toHaveLength(0);
  await editor.getByLabel('GeoJSON file (one LineString, up to 2 MB)').setInputFiles({
    name: 'route.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(
      JSON.stringify({ type: 'Feature', properties: { note: 'discard' }, geometry: path }),
    ),
  });
  await expect(editor.getByText(/4 path points/)).toBeVisible();
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Route write rejected');
  await expect(editor.getByText(/4 path points/)).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Publish reviewed path' })).toHaveCount(0);
  expect(writes.map((write) => write.method)).toEqual(['admin_create_route_shape_version']);
});

test('a map outage prevents publishing a saved draft', async ({ page }) => {
  await installAdminWorkflowMock(page);
  await installMapProviderOutage(page);
  const writes = await installPathRpcMock(page, { saved: true });
  await page.goto(`/admin/routes/${ADMIN_IDS.route}`);
  const editor = page.getByTestId('route-path-editor');
  await expect(editor.getByText(/The map is unavailable/)).toBeVisible();
  await expect(editor.getByRole('checkbox', { name: /I reviewed/ })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Publish reviewed path' })).toBeDisabled();
  expect(writes).toHaveLength(0);
});

test('failed version loading blocks all path writes', async ({ page }) => {
  await installAdminWorkflowMock(page);
  await installMapProviderAvailable(page);
  const writes = await installPathRpcMock(page, { rejectLoad: true });
  await page.goto(`/admin/routes/${ADMIN_IDS.route}`);
  const editor = page.getByTestId('route-path-editor');
  await expect(editor.getByRole('alert')).toContainText('could not load the saved road paths');
  await expect(editor.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(0);
});
