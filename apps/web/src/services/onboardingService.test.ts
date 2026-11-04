import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createTenantWithAdmin,
  departAdministrator,
  dispatchBulkInvitations,
  emergencyRecovery,
  inviteAdministrator,
  inviteTenantMember,
  restoreAdministrator,
  suspendAdministrator,
  updateInvitation,
  updateTenantLifecycle,
} from './onboardingService';
import { DuplicateIdentifierError } from './transportationStructureService';

const auth = vi.hoisted(() => ({ token: 'synthetic-session' as string | null }));
vi.mock('@/lib/supabase', () => ({
  supabaseConfigError: null,
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: auth.token ? { access_token: auth.token } : null },
      }),
    },
  },
}));

const request = vi.fn();
const createAuthority = () =>
  createTenantWithAdmin({
    tenantName: 'Example School Division',
    tenantType: 'school_district',
    adminName: 'Example Admin',
    adminEmail: 'admin@example.test',
  });
const guardian = {
  role: 'guardian' as const,
  firstName: 'Example',
  lastName: 'Guardian',
  email: 'guardian@example.test',
  phone: '403-555-0100',
};

beforeEach(() => {
  auth.token = 'synthetic-session';
  request.mockReset();
  vi.stubGlobal('fetch', request);
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['HTML fallback', '<html>SafeBus</html>', 'text/html'],
  ['invalid JSON', '{incomplete', 'application/json'],
  ['null', 'null', 'application/json'],
  ['an array', '[]', 'application/json'],
  ['an empty result', '{}', 'application/json'],
  ['an unrelated result', '{"message":"OK"}', 'application/json'],
])('does not confirm authority creation after %s', async (_, body, contentType) => {
  request.mockResolvedValue(new Response(body, { headers: { 'content-type': contentType } }));
  await expect(createAuthority()).rejects.toThrow('Refresh the current status before trying again');
  expect(request).toHaveBeenCalledTimes(1);
});

it.each([
  ['guardian invitation', () => inviteTenantMember(guardian)],
  ['driver invitation', () => inviteTenantMember({ ...guardian, role: 'driver' })],
  [
    'administrator invitation',
    () =>
      inviteAdministrator({
        fullName: 'Example Admin',
        email: 'admin@example.test',
        role: 'tenant_admin',
      }),
  ],
  ['invitation cancellation', () => updateInvitation('invitation-a', 'cancel')],
  ['school authority suspension', () => updateTenantLifecycle('authority-a', 'suspended')],
  ['emergency recovery', () => emergencyRecovery('admin-a', 'authority-a')],
  ['administrator departure', () => departAdministrator('admin-a')],
  ['administrator suspension', () => suspendAdministrator('admin-a')],
  ['administrator restoration', () => restoreAdministrator('admin-a')],
  ['bulk invitations', () => dispatchBulkInvitations('batch-a')],
])('does not silently accept an empty confirmation for %s', async (_, action) => {
  request.mockResolvedValue(Response.json({}));
  await expect(action()).rejects.toThrow('Refresh the current status before trying again');
  expect(request).toHaveBeenCalledTimes(1);
});

it('preserves an explicit rejection even if the HTTP status is successful', async () => {
  request.mockResolvedValue(Response.json({ error: 'The invitation could not be finalized.' }));
  await expect(createAuthority()).rejects.toThrow('The invitation could not be finalized.');
});

it('preserves duplicate-field errors so the form can identify the existing email', async () => {
  request.mockResolvedValue(
    Response.json({ error: 'This email address is already linked.' }, { status: 409 }),
  );
  await expect(inviteTenantMember(guardian)).rejects.toMatchObject({
    name: new DuplicateIdentifierError('email', '').name,
    field: 'email',
  });
});

it('does not send an onboarding request without a signed-in session', async () => {
  auth.token = null;
  await expect(createAuthority()).rejects.toThrow('Sign in required.');
  expect(request).not.toHaveBeenCalled();
});

it('does not retry or expose a raw network error after an uncertain result', async () => {
  request.mockRejectedValue(new TypeError('private upstream URL failed'));
  await expect(createAuthority()).rejects.toThrow('Refresh the current status before trying again');
  expect(request).toHaveBeenCalledTimes(1);
});

it('accepts the confirmed invitation without treating pending activation as an error', async () => {
  const result = {
    tenant: { id: 'authority-a', name: 'Example School Division' },
    invitationStatus: 'sent',
    recipientEmail: 'admin@example.test',
  };
  request.mockResolvedValue(Response.json(result));
  await expect(createAuthority()).resolves.toEqual(result);
});

it('accepts an idempotent lifecycle confirmation', async () => {
  const result = { status: 'suspended', previous_status: 'suspended', changed: false };
  request.mockResolvedValue(Response.json(result));
  await expect(updateTenantLifecycle('authority-a', 'suspended')).resolves.toEqual(result);
});

it('accepts a bulk dispatch with no invitations waiting', async () => {
  const result = { batchId: 'batch-a', claimed: 0, sent: 0, failed: 0, summary: {} };
  request.mockResolvedValue(Response.json(result));
  await expect(dispatchBulkInvitations('batch-a')).resolves.toEqual(result);
});
