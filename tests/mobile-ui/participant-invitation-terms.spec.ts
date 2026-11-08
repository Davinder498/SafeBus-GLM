import { expect, test, type Page } from '@playwright/test';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { installSupabaseMock } from '../smoke/fixtures/supabase-mock';
import { installGuardianVisibilityMock } from '../smoke/fixtures/guardian-bus-visibility';

const documentId = '00000000-0000-4000-8000-000000000018';
const digest = 'a'.repeat(64);
type ParticipantRole = 'driver' | 'guardian';

function agreement(role: ParticipantRole, status: 'pending' | 'accepted' | 'not_published') {
  if (status === 'not_published') return { required: true, status };
  return {
    required: true,
    status,
    terms: {
      id: documentId,
      title: 'SafeBus Terms of Use — Driver and Guardian Accounts',
      version: '2026.1',
      sha256: digest,
      body: 'These are example test terms only. Do not use a phone while driving.',
    },
    notice: {
      url: role === 'driver' ? '/privacy#drivers' : '/privacy#guardians',
      version: role === 'driver' ? 'driver-2026-11-05-v1' : 'guardian-2026-11-05-v1',
    },
  };
}

async function installRole(page: Page, role: ParticipantRole) {
  await installLocalOnlyBoundary(page);
  if (role === 'driver') await installSupabaseMock(page);
  else await installGuardianVisibilityMock(page);
}

test('new driver cannot bypass the invitation Terms; separate acknowledgments create one server receipt', async ({ page }) => {
  await installRole(page, 'driver');
  let accepted = false;
  const requests: unknown[] = [];

  await page.route('**/rest/v1/rpc/get_my_participant_agreement', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(agreement('driver', accepted ? 'accepted' : 'pending')),
    }),
  );
  await page.route('**/rest/v1/rpc/accept_my_participant_agreement', (route) => {
    requests.push(route.request().postDataJSON());
    accepted = true;
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'accepted' }) });
  });

  // A direct dashboard URL still enters the agreement screen for a new account.
  await page.goto('/driver');
  await expect(page).toHaveURL('/participant/agreements');
  await expect(page.getByRole('heading', { name: 'Terms of Use and Privacy Notice' })).toBeVisible();
  await expect(page.getByText('Version 2026.1')).toBeVisible();

  const submit = page.getByRole('button', { name: 'Agree and continue' });
  await expect(submit).toBeDisabled();
  await page.getByRole('checkbox').first().check();
  await expect(submit).toBeDisabled();
  await expect(page.getByText('not consent to optional notifications')).toBeVisible();
  await page.getByRole('checkbox').last().check();
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page).toHaveURL('/driver');
  await expect(page.getByTestId('native-bottom-navigation')).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    p_document_id: documentId,
    p_terms_sha256: digest,
    p_terms_accepted: true,
    p_notice_acknowledged: true,
  });
});

test('new guardian cannot bypass unpublished terms or fabricate consent', async ({ page }) => {
  await installRole(page, 'guardian');
  let attempted = 0;
  await page.route('**/rest/v1/rpc/get_my_participant_agreement', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(agreement('guardian', 'not_published')) }),
  );
  await page.route('**/rest/v1/rpc/accept_my_participant_agreement', (route) => {
    attempted += 1;
    return route.fulfill({ status: 401, json: { message: 'Denied' } });
  });

  await page.goto('/parent');
  await expect(page).toHaveURL('/participant/agreements');
  await expect(page.getByRole('heading', { name: 'Terms of Use and Privacy Notice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agree and continue' })).toHaveCount(0);
  await expect(page.getByText('not available yet')).toBeVisible();
  expect(attempted).toBe(0);
});

test('server failure does not silently grant dashboard access to a new participant', async ({ page }) => {
  await installRole(page, 'driver');
  await page.route('**/rest/v1/rpc/get_my_participant_agreement', (route) =>
    route.fulfill({ status: 503, json: { message: 'Temporarily unavailable' } }),
  );
  await page.goto('/driver');
  await expect(page.getByRole('heading', { name: 'Account verification unavailable' })).toBeVisible();
  await expect(page.getByTestId('native-bottom-navigation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('existing guardian is grandfathered and retains normal bus visibility', async ({ page }) => {
  await installRole(page, 'guardian');
  await page.route('**/rest/v1/rpc/get_my_participant_agreement', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ required: false, status: 'grandfathered' }) }),
  );
  await page.goto('/parent');
  await expect(page.getByTestId('native-bottom-navigation')).toBeVisible();
  await expect(page).toHaveURL('/parent');
  await expect(page.getByRole('heading', { name: 'Terms of Use and Privacy Notice' })).toHaveCount(0);
});
