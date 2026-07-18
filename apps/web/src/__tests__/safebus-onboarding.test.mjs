import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.SAFEBUS_INVITE_REDIRECT_URL = 'https://app.example.test/login';

const { createClient } = await import('@supabase/supabase-js');
const { handler } = await import('../../netlify/functions/safebus-onboarding.mjs');

const caller = {
  id: 'admin-1',
  tenant_id: 'tenant-1',
  role: 'tenant_admin',
  status: 'active',
  full_name: 'Tenant Admin',
  email: 'admin@example.test',
};

function query(result = { data: null, error: null }) {
  const value = {
    select: vi.fn(() => value),
    eq: vi.fn(() => value),
    ilike: vi.fn(() => value),
    neq: vi.fn(() => value),
    order: vi.fn(() => value),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    upsert: vi.fn(() => value),
    insert: vi.fn(() => value),
    update: vi.fn(() => value),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return value;
}

function setupClients({
  profile = null,
  callerProfile = caller,
  authUser = {
    id: 'guardian-auth-1',
    email: 'guardian@example.test',
    last_sign_in_at: null,
  },
} = {}) {
  const userClient = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: callerProfile.id } },
        error: null,
      })),
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
  const profileLookup = query({ data: profile, error: null });
  const callerLookup = query({ data: callerProfile, error: null });
  const guardianWrite = query({ data: { id: 'guardian-row-1' }, error: null });
  const defaultWrite = query({ data: null, error: null });
  let profileSelectCount = 0;
  const adminClient = {
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async () => ({
          data: { user: authUser },
          error: null,
        })),
        getUserById: vi.fn(async () => ({
          data: { user: authUser },
          error: null,
        })),
      },
      resend: vi.fn(async () => ({ data: {}, error: null })),
    },
    from: vi.fn((table) => {
      if (table === 'profiles') {
        profileSelectCount += 1;
        return profileSelectCount === 1 ? callerLookup : profileLookup;
      }
      if (table === 'guardians') return guardianWrite;
      return defaultWrite;
    }),
  };
  createClient.mockReturnValueOnce(userClient).mockReturnValueOnce(adminClient);
  return { userClient, adminClient };
}

function event(body) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: JSON.stringify({ kind: 'inviteMember', role: 'guardian', ...body }),
  };
}

describe('SafeBus member onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invites a new guardian and returns the tenant-scoped guardian id', async () => {
    const { adminClient } = setupClients();
    const response = await handler(
      event({
        firstName: 'Guardian',
        lastName: 'One',
        email: 'guardian@example.test',
        phone: '555-0100',
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: 'sent',
      guardianId: 'guardian-row-1',
    });
    expect(adminClient.auth.admin.inviteUserByEmail).toHaveBeenCalledOnce();
    expect(adminClient.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(adminClient.auth.admin.listUsers).toBeUndefined();
  });

  it('uses direct user-id lookup for an existing same-tenant profile', async () => {
    const existingProfile = {
      id: 'guardian-auth-1',
      tenant_id: 'tenant-1',
      role: 'guardian',
      status: 'invited',
    };
    const { adminClient } = setupClients({ profile: existingProfile });
    const response = await handler(
      event({
        firstName: 'Guardian',
        lastName: 'One',
        email: 'guardian@example.test',
        phone: '555-0100',
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).status).toBe('resent');
    expect(adminClient.auth.admin.getUserById).toHaveBeenCalledWith('guardian-auth-1');
    expect(adminClient.auth.resend).toHaveBeenCalledOnce();
    expect(adminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(adminClient.auth.admin.listUsers).toBeUndefined();
  });

  it('rejects an email already assigned to another tenant', async () => {
    const { adminClient } = setupClients({
      profile: {
        id: 'guardian-auth-2',
        tenant_id: 'tenant-2',
        role: 'guardian',
        status: 'active',
      },
    });
    const response = await handler(
      event({
        firstName: 'Other Tenant',
        lastName: 'Guardian',
        email: 'guardian@example.test',
        phone: '555-0100',
      }),
    );

    expect(response.statusCode).toBe(409);
    expect(adminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(adminClient.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('does not silently reactivate a suspended member', async () => {
    const { adminClient } = setupClients({
      profile: {
        id: 'guardian-auth-1',
        tenant_id: 'tenant-1',
        role: 'guardian',
        status: 'suspended',
      },
    });
    const response = await handler(
      event({
        firstName: 'Suspended',
        lastName: 'Guardian',
        email: 'guardian@example.test',
        phone: '555-0100',
      }),
    );

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toContain('suspended or disabled');
    expect(adminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('requires a valid email before calling the Auth admin API', async () => {
    const { adminClient } = setupClients();
    const response = await handler(
      event({
        firstName: 'Guardian',
        lastName: 'One',
        email: 'not-an-email',
        phone: '555-0100',
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(adminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('validates complete driver licence and address details before sending an invite', async () => {
    const { adminClient } = setupClients();
    const response = await handler(
      event({
        role: 'driver',
        firstName: 'Alex',
        lastName: 'Driver',
        email: 'alex.driver@example.test',
        phone: '780-555-0100',
        licenseNumber: 'AB-123456',
        licenseIssueDate: '2025-01-01',
        licenseExpiryDate: '2030-01-01',
        licenseClass: '2',
        addressLine1: '100 Main Street',
        city: 'Edmonton',
        province: 'AB',
        postalCode: 'T5J 0N3',
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'sent', guardianId: null });
    expect(adminClient.auth.admin.inviteUserByEmail).toHaveBeenCalledOnce();
  });

  it('does not call Auth when required driver compliance details are missing', async () => {
    const { adminClient } = setupClients();
    const response = await handler(
      event({
        role: 'driver',
        firstName: 'Alex',
        lastName: 'Driver',
        email: 'alex.driver@example.test',
        phone: '780-555-0100',
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(adminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });
});
