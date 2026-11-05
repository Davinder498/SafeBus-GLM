import { expect, test } from '@playwright/test';
import { installAdminWorkflowMock } from './fixtures/admin-workflow';
import { expectNoWcagAaViolations } from './fixtures/accessibility';

test('school authority admin can preserve a selected record and review the confirmed request', async ({
  page,
}) => {
  await installAdminWorkflowMock(page);
  const recordId = '11111111-1111-4111-8111-111111111222';
  const holds: unknown[] = [];
  const writes: unknown[] = [];
  await page.route('**/.netlify/functions/disposal-records', async (route) => {
    const { action, data } = route.request().postDataJSON();
    let result: unknown;
    if (action === 'status')
      result = {
        enabled: false,
        lastRun: null,
        activeHolds: holds.length,
        reviewDue: 0,
        pendingAccounts: 0,
        totals: [],
        extensions: [],
      };
    if (action === 'holds') result = holds;
    if (action === 'candidates')
      result = [{ id: recordId, label: 'Synthetic student', status: 'inactive' }];
    if (action === 'preserve') {
      writes.push(data);
      holds.push({
        id: 'hold-1',
        policy_key: data.policy,
        record_id: data.recordId,
        reference: data.reference,
        minimum_until: '2029-12-01T00:00:00Z',
        review_at: data.reviewAt,
        created_at: '2026-11-05T00:00:00Z',
        released_at: null,
      });
      result = { confirmed: true };
    }
    await route.fulfill({ status: result === undefined ? 400 : 200, json: { result } });
  });
  await page.goto('/admin/records-disposal');
  await expect(page.getByRole('heading', { name: 'Records disposal', exact: true })).toBeVisible();
  await expect(page.getByText('Not activated', { exact: true })).toBeVisible();
  await page.getByLabel('Record', { exact: true }).selectOption(recordId);
  await page.getByLabel('Internal case reference').fill('CASE-SYNTHETIC');
  await page.getByLabel('Next review').fill('2030-01-01T10:00');
  await page.getByRole('button', { name: 'Save record preservation' }).click();
  await expect(page.getByText('CASE-SYNTHETIC · Students', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    policy: 'student_records',
    recordId,
    reference: 'CASE-SYNTHETIC',
  });
  await expect(page.getByRole('button', { name: 'Release record preservation' })).toBeDisabled();
  await expectNoWcagAaViolations(page, 'Records disposal');
});
