import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const read = async (file) => fs.readFile(new URL('../../' + file, import.meta.url), 'utf8');
const normalized = (value) => value.replace(/\s+/g, ' ').replace(/\*\*/g, '');

const files = {
  msa: 'docs/governance/phase-3/business-pack/master-services-agreement.md',
  dpa: 'docs/governance/phase-3/business-pack/data-processing-agreement.md',
  order: 'docs/governance/phase-3/business-pack/order-form.md',
  returnSchedule: 'docs/governance/phase-3/business-pack/data-return-destruction.md',
  owner: 'docs/governance/phase-3/business-pack/owner-decisions.md',
  pilot: 'docs/governance/phase-3/business-pack/pilot-contract-signoff-2026-11-07.md',
  index: 'docs/governance/phase-3/business-pack/README.md',
  operations: 'docs/operations/cr1-remaining-launch-work-2026-11-08.md',
  digital: 'docs/governance/phase-3/business-pack/digital-agreement-implementation-2026-11-07.md',
};

test('owner-approved district-controlled model replaces a blanket 30-day return and 60-day purge', async () => {
  const contents = Object.fromEntries(
    await Promise.all(Object.entries(files).map(async ([name, file]) => [name, normalized(await read(file))])),
  );
  for (const [name, value] of Object.entries(contents)) {
    assert.match(value, /district.controlled|school.authority.controlled|district's ability to manage|district data control/i, name);
    assert.match(value, /30.day/i, name);
    assert.match(value, /60.day/i, name);
  }
  assert.match(contents.returnSchedule, /No universal mandatory 30-day export or 60-day deletion period applies/i);
  assert.match(contents.msa, /does not impose a blanket 30-day data-return period or 60-day primary-deletion deadline/i);
  assert.match(contents.dpa, /No universal 30-day return or 60-day deletion commitment/i);
  assert.match(contents.order, /No blanket 30-day return or 60-day deletion promise/i);
  assert.match(contents.owner, /no mandatory 30-day export or 60-day purge/i);
  assert.match(contents.returnSchedule, /A directory download is not a complete/i);
  assert.match(contents.returnSchedule, /no unverified general full-district export feature, automatic closure purge or unconditional completion date/i);
});

test('self-service exports are scoped to supported directories, with per-record permissions and closure assistance', async () => {
  const page = await read('apps/web/src/pages/AdminSettingsPage.tsx');
  assert.match(page, /profile\?\.role === 'tenant_admin'/);
  assert.match(page, /data-testid="tenant-data-management"/);
  for (const path of ['/admin/students', '/admin/guardians', '/admin/drivers', '/admin/buses']) {
    assert.ok(page.includes(path), path);
  }
  assert.match(page, /filtered directory exports, not a complete legal archive/i);
  assert.match(page, /to="\/admin\/records-disposal"/);
  assert.match(page, /to="\/admin\/settings\/support"/);
  assert.doesNotMatch(page, /delete all data|Delete everything|deleteTenantData/i);

  for (const [name, file] of [
    ['Students', 'apps/web/src/pages/AdminStudentsPage.tsx'],
    ['Guardians', 'apps/web/src/pages/AdminGuardiansPage.tsx'],
    ['Drivers', 'apps/web/src/pages/AdminDriversPage.tsx'],
    ['Buses', 'apps/web/src/pages/AdminBusesPage.tsx'],
  ]) {
    const directory = await read(file);
    assert.match(directory, /AdminDataDownloads/, name);
  }
  const csvService = await read('apps/web/src/services/adminDownloadService.ts');
  assert.match(csvService, /result\.data\.role !== 'tenant_admin'/);
  assert.match(csvService, /row\.tenant_id !== context\.tenantId/);
  assert.match(csvService, /totalCount > maxRecords/);
  const students = await read('apps/web/src/services/adminStudentsService.ts');
  const guardians = await read('apps/web/src/services/studentGuardianService.ts');
  assert.match(students, /from\('students'\)\.delete\(\)/);
  assert.match(guardians, /from\('guardians'\)\.delete\(\)/);
});

test('data management terms preserve holds, supplier copies and real readiness gates', async () => {
  const schedule = normalized(await read(files.returnSchedule));
  const msa = normalized(await read(files.msa));
  const dpa = normalized(await read(files.dpa));
  assert.match(schedule, /Scheduled destructive disposal remains disabled until separately authorized and verified/i);
  assert.match(schedule, /The application cannot selectively erase every immutable backup/i);
  assert.match(schedule, /mandatory retention obligation/i);
  assert.match(schedule, /not a blanket certificate of complete destruction/i);
  assert.match(msa, /not activate destructive automatic retention/i);
  assert.match(dpa, /Destructive automated retention remains separately gated/i);
  assert.match(msa, /not executed/i);
  for (const path of [
    'docs/governance/privacy-readiness.json',
    'docs/governance/map-readiness.json',
    'docs/governance/operations-readiness.json',
  ]) {
    assert.equal(JSON.parse(await read(path)).status, 'not_approved', path);
  }
  assert.equal(JSON.parse(await read('docs/governance/pilot-authorization.json')).status, 'not_authorized');
});
