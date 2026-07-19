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
    in: vi.fn(() => value),
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
  rpcResults = [
    {
      data: {
        profileId: 'guardian-auth-1',
        guardianId: 'guardian-row-1',
        driverId: null,
      },
      error: null,
    },
  ],
  adminRpcResults = [{ data: null, error: null }],
  inviteError = null,
  resetPasswordError = null,
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
    rpc: vi.fn(async () => rpcResults.shift() ?? { data: null, error: null }),
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
          error: inviteError,
        })),
        getUserById: vi.fn(async () => ({
          data: { user: authUser },
          error: null,
        })),
        updateUserById: vi.fn(async () => ({
          data: { user: authUser },
          error: null,
        })),
        deleteUser: vi.fn(async () => ({ data: { user: authUser }, error: null })),
      },
      resend: vi.fn(async () => ({ data: {}, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({
        data: {},
        error: resetPasswordError,
      })),
    },
    rpc: vi.fn(async () => adminRpcResults.shift() ?? { data: null, error: null }),
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
  return { userClient, adminClient, profileLookup };
}

function event(body) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: JSON.stringify({ kind: 'inviteMember', role: 'guardian', ...body }),
  };
}

function createTenantEvent(body = {}) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer test-token', origin: 'https://app.example.test' },
    body: JSON.stringify({
      kind: 'createTenant',
      tenantName: 'Test Transportation',
      tenantType: 'bus_contractor',
      schoolName: '',
      city: 'Red Deer',
      adminName: 'First Admin',
      adminEmail: 'first.admin@example.test',
      ...body,
    }),
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
      driverId: null,
      recipientEmail: 'guardian@example.test',
    });
    expect(adminClient.rpc).toHaveBeenCalledWith('server_get_member_invitation_state', {
      p_email: 'guardian@example.test',
    });
    expect(adminClient.auth.admin.inviteUserByEmail).toHaveBeenCalledOnce();
    expect(adminClient.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      'guardian@example.test',
      expect.objectContaining({
        redirectTo: 'https://app.example.test/accept-invitation',
      }),
    );
    expect(adminClient.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(adminClient.auth.admin.listUsers).toBeUndefined();
  });

  it('finalizes a guardian and selected student link in one database request', async () => {
    const { adminClient, userClient } = setupClients();
    const response = await handler(
      event({
        firstName: 'Guardian',
        lastName: 'Linked',
        email: 'guardian@example.test',
        phone: '5878940568',
        studentLinks: [
          {
            studentId: 'student-1',
            relationship: 'mother',
          },
        ],
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(userClient.rpc).toHaveBeenCalledTimes(1);
    expect(userClient.rpc).toHaveBeenCalledWith(
      'admin_finalize_member_invitation',
      expect.objectContaining({
        p_role: 'guardian',
        p_phone: '5878940568',
        p_student_links: [
          {
            studentId: 'student-1',
            relationship: 'mother',
          },
        ],
      }),
    );
    expect(adminClient.from).not.toHaveBeenCalledWith('students');
    expect(adminClient.from).not.toHaveBeenCalledWith('guardians');
    expect(adminClient.from).not.toHaveBeenCalledWith('tenant_onboarding_invitations');
  });

  it('rolls back a newly invited Auth user when atomic member finalization fails', async () => {
    const { adminClient } = setupClients({
      rpcResults: [
        {
          data: null,
          error: { message: 'Selected student is outside the tenant.' },
        },
      ],
    });
    const response = await handler(
      event({
        firstName: 'Guardian',
        lastName: 'Invalid Link',
        email: 'guardian@example.test',
        phone: '5878940568',
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('could not create the member record');
    expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledWith('guardian-auth-1');
  });

  it('uses account recovery for a confirmed pending member invitation', async () => {
    const { adminClient } = setupClients({
      adminRpcResults: [
        {
          data: {
            authUserId: 'guardian-auth-1',
            emailConfirmed: true,
            profileId: 'guardian-auth-1',
            profileTenantId: 'tenant-1',
            profileRole: 'guardian',
            profileStatus: 'invited',
          },
          error: null,
        },
      ],
    });
    const response = await handler(
      event({
        firstName: 'Guardian',
        lastName: 'One',
        email: 'guardian@example.test',
        phone: '555-0100',
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).status).toBe('recovery_sent');
    expect(adminClient.auth.resetPasswordForEmail).toHaveBeenCalledWith('guardian@example.test', {
      redirectTo: 'https://app.example.test/accept-invitation',
    });
    expect(adminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(adminClient.auth.admin.listUsers).toBeUndefined();
  });

  it('resends an unconfirmed pending member without deleting its profile', async () => {
    const { adminClient, userClient } = setupClients({
      adminRpcResults: [
        {
          data: {
            authUserId: 'stale-guardian-auth',
            emailConfirmed: false,
            profileId: 'stale-guardian-auth',
            profileTenantId: 'tenant-1',
            profileRole: 'guardian',
            profileStatus: 'invited',
          },
          error: null,
        },
      ],
      rpcResults: [
        {
          data: {
            profileId: 'stale-guardian-auth',
            guardianId: 'guardian-row-1',
            driverId: null,
          },
          error: null,
        },
      ],
    });

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
    expect(adminClient.auth.resend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'signup',
        email: 'guardian@example.test',
      }),
    );
    expect(adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(adminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(userClient.rpc).toHaveBeenCalledWith(
      'admin_finalize_member_invitation',
      expect.objectContaining({ p_auth_user_id: 'stale-guardian-auth' }),
    );
  });

  it('rejects an email already assigned to another tenant', async () => {
    const { adminClient } = setupClients({
      adminRpcResults: [
        {
          data: {
            authUserId: 'guardian-auth-2',
            emailConfirmed: true,
            profileId: 'guardian-auth-2',
            profileTenantId: 'tenant-2',
            profileRole: 'guardian',
            profileStatus: 'active',
          },
          error: null,
        },
      ],
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
      adminRpcResults: [
        {
          data: {
            authUserId: 'guardian-auth-1',
            emailConfirmed: true,
            profileId: 'guardian-auth-1',
            profileTenantId: 'tenant-1',
            profileRole: 'guardian',
            profileStatus: 'suspended',
          },
          error: null,
        },
      ],
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
    const { adminClient, userClient } = setupClients({
      rpcResults: [
        {
          data: {
            profileId: 'driver-auth-1',
            guardianId: null,
            driverId: 'driver-row-1',
          },
          error: null,
        },
      ],
      authUser: {
        id: 'driver-auth-1',
        email: 'alex.driver@example.test',
        last_sign_in_at: null,
      },
    });
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
    expect(JSON.parse(response.body)).toEqual({
      status: 'sent',
      guardianId: null,
      driverId: 'driver-row-1',
      recipientEmail: 'alex.driver@example.test',
    });
    expect(adminClient.auth.admin.inviteUserByEmail).toHaveBeenCalledOnce();
    expect(userClient.rpc).toHaveBeenCalledWith(
      'admin_finalize_member_invitation',
      expect.objectContaining({
        p_role: 'driver',
        p_driver_details: expect.objectContaining({
          license_number: 'AB-123456',
          postal_code: 'T5J 0N3',
        }),
      }),
    );
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

  it('lets only the platform super admin deactivate a tenant admin account', async () => {
    const platformAdmin = {
      ...caller,
      id: 'platform-admin-1',
      tenant_id: null,
      role: 'platform_super_admin',
    };
    const tenantAdmin = {
      id: 'tenant-admin-1',
      tenant_id: 'tenant-1',
      role: 'tenant_admin',
      status: 'active',
    };
    const { adminClient } = setupClients({
      callerProfile: platformAdmin,
      profile: tenantAdmin,
      authUser: {
        id: tenantAdmin.id,
        email: 'tenant-admin@example.test',
        last_sign_in_at: '2026-01-01T00:00:00Z',
      },
    });

    const response = await handler({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer test-token' },
      body: JSON.stringify({
        kind: 'tenantAdminLifecycle',
        profileId: tenantAdmin.id,
        status: 'disabled',
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'disabled' });
    expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith(tenantAdmin.id, {
      ban_duration: '876000h',
    });
  });

  it('does not create a tenant when the initial invitation provider rejects the email', async () => {
    const platformAdmin = {
      ...caller,
      id: 'platform-admin-1',
      tenant_id: null,
      role: 'platform_super_admin',
    };
    const { adminClient, userClient } = setupClients({
      callerProfile: platformAdmin,
      rpcResults: [{ data: null, error: null }],
      inviteError: { message: 'User already registered' },
      authUser: null,
    });

    const response = await handler(createTenantEvent());

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toContain(
      'invitation email was not sent and no tenant was created',
    );
    expect(userClient.rpc).toHaveBeenCalledTimes(1);
    expect(userClient.rpc).toHaveBeenCalledWith('platform_find_unprofiled_auth_user', {
      p_email: 'first.admin@example.test',
    });
    expect(adminClient.from).not.toHaveBeenCalledWith('tenants');
  });

  it('finalizes the tenant only after the invitation provider accepts the email', async () => {
    const platformAdmin = {
      ...caller,
      id: 'platform-admin-1',
      tenant_id: null,
      role: 'platform_super_admin',
    };
    const setup = {
      tenant: { id: 'tenant-new', name: 'Test Transportation', status: 'active' },
      school: null,
    };
    const { adminClient, userClient } = setupClients({
      callerProfile: platformAdmin,
      rpcResults: [
        { data: null, error: null },
        { data: setup, error: null },
      ],
      authUser: {
        id: 'tenant-admin-new',
        email: 'first.admin@example.test',
        last_sign_in_at: null,
      },
    });

    const response = await handler(createTenantEvent());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      ...setup,
      invitationStatus: 'sent',
      recipientEmail: 'first.admin@example.test',
    });
    expect(userClient.rpc).toHaveBeenNthCalledWith(2, 'platform_finalize_tenant_invitation', {
      p_auth_user_id: 'tenant-admin-new',
      p_tenant_name: 'Test Transportation',
      p_tenant_type: 'bus_contractor',
      p_school_name: null,
      p_city: 'Red Deer',
      p_admin_name: 'First Admin',
      p_admin_email: 'first.admin@example.test',
    });
    expect(adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('sends account recovery when a deleted profile left an existing Auth user', async () => {
    const platformAdmin = {
      ...caller,
      id: 'platform-admin-1',
      tenant_id: null,
      role: 'platform_super_admin',
    };
    const setup = {
      tenant: { id: 'tenant-recovered', name: 'Test Transportation', status: 'active' },
      school: null,
    };
    const { adminClient } = setupClients({
      callerProfile: platformAdmin,
      rpcResults: [
        {
          data: {
            id: 'orphan-auth-user',
            emailConfirmed: true,
            hasPassword: false,
          },
          error: null,
        },
        { data: setup, error: null },
      ],
    });

    const response = await handler(createTenantEvent());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).invitationStatus).toBe('recovery_sent');
    expect(adminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(adminClient.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'first.admin@example.test',
      { redirectTo: 'https://app.example.test/accept-invitation' },
    );
    expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('orphan-auth-user', {
      ban_duration: 'none',
      user_metadata: { full_name: 'First Admin' },
    });
  });

  it('replaces an unconfirmed orphan Auth row before sending a fresh invitation', async () => {
    const platformAdmin = {
      ...caller,
      id: 'platform-admin-1',
      tenant_id: null,
      role: 'platform_super_admin',
    };
    const setup = {
      tenant: { id: 'tenant-fresh', name: 'Test Transportation', status: 'active' },
      school: null,
    };
    const { adminClient, userClient } = setupClients({
      callerProfile: platformAdmin,
      rpcResults: [
        {
          data: {
            id: 'unconfirmed-orphan-auth-user',
            emailConfirmed: false,
            hasPassword: false,
          },
          error: null,
        },
        { data: setup, error: null },
      ],
      authUser: {
        id: 'fresh-tenant-admin-auth-user',
        email: 'first.admin@example.test',
        last_sign_in_at: null,
      },
    });

    const response = await handler(createTenantEvent());

    expect(response.statusCode).toBe(200);
    expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledWith('unconfirmed-orphan-auth-user');
    expect(adminClient.auth.admin.inviteUserByEmail).toHaveBeenCalledOnce();
    expect(userClient.rpc).toHaveBeenNthCalledWith(2, 'platform_finalize_tenant_invitation', {
      p_auth_user_id: 'fresh-tenant-admin-auth-user',
      p_tenant_name: 'Test Transportation',
      p_tenant_type: 'bus_contractor',
      p_school_name: null,
      p_city: 'Red Deer',
      p_admin_name: 'First Admin',
      p_admin_email: 'first.admin@example.test',
    });
  });
});
