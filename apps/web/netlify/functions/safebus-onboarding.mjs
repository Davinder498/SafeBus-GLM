import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CANADIAN_POSTAL_CODE_PATTERN = /^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i;
const MEMBER_ROLES = new Set(['driver', 'guardian']);
const ALBERTA_LICENSE_CLASSES = new Set(['1', '2', '3', '4', '5', '6', '7']);
const GUARDIAN_RELATIONSHIPS = new Set(['mother', 'father', 'guardian', 'caregiver', 'other']);
const SUPABASE_REQUEST_TIMEOUT_MS = 12_000;

class OnboardingConfigurationError extends Error {
  constructor() {
    super('Server onboarding is not configured.');
    this.name = 'OnboardingConfigurationError';
  }
}

function passwordSetupDeliveryError(error) {
  const code = clean(error?.code).toLowerCase();
  const message = clean(error?.message).toLowerCase();
  if (
    Number(error?.status) === 429 ||
    code.includes('rate_limit') ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  ) {
    return 'Supabase email rate limit reached. Wait before sending another password setup email.';
  }
  return 'The password setup email was not accepted by the email provider.';
}

async function invitationRedirectUrl(ctx) {
  const configured = clean(process.env.SAFEBUS_INVITE_REDIRECT_URL);
  if (!configured) return null;

  try {
    const redirect = new URL(configured);
    const { data: allowed, error } = await ctx.user.rpc('is_allowed_redirect_origin', {
      p_origin: redirect.origin.toLowerCase(),
    });
    if (error || !allowed) {
      throw new Error('Server invitation redirect is not in the approved origin allowlist.');
    }
    redirect.pathname = '/accept-invitation';
    redirect.search = '';
    redirect.hash = '';
    return redirect.toString();
  } catch {
    throw new Error('Server invitation redirect is not a valid absolute URL.');
  }
}

async function fetchWithTimeout(input, init = {}) {
  const timeoutSignal = AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

function clients(token) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new OnboardingConfigurationError();
  /** @type {import('@supabase/supabase-js').SupabaseClient<import('@safebus/types/database').Database>} */
  const user = createClient(url, anon, {
      global: {
        fetch: fetchWithTimeout,
        headers: { Authorization: `Bearer ${token}` },
      },
    });
  /** @type {import('@supabase/supabase-js').SupabaseClient<import('@safebus/types/database').Database>} */
  const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchWithTimeout },
    });
  return { user, admin };
}

async function requireCaller(event, allowedRoles) {
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { error: json(401, { error: 'Sign in required.' }) };
  const c = clients(token);
  const { data: userData, error: userError } = await c.user.auth.getUser();
  if (userError || !userData.user) return { error: json(401, { error: 'Invalid session.' }) };
  const { data: profile, error: profileError } = await c.admin
    .from('profiles')
    .select('id, tenant_id, role, status, full_name, email')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (
    profileError ||
    !profile ||
    profile.status !== 'active' ||
    !allowedRoles.includes(profile.role)
  ) {
    return {
      error: json(403, { error: 'You are not allowed to perform this onboarding action.' }),
    };
  }
  const assurance = await c.user.auth.mfa.getAuthenticatorAssuranceLevel(token);
  if (assurance.error || assurance.data.currentLevel !== 'aal2') {
    return {
      error: json(403, {
        error: 'Complete multi-factor authentication before performing this administrative action.',
      }),
    };
  }

  const signedInAt = userData.user.last_sign_in_at
    ? Date.parse(userData.user.last_sign_in_at)
    : Number.NaN;
  if (!Number.isFinite(signedInAt) || Date.now() - signedInAt > 15 * 60 * 1000) {
    return {
      error: json(403, {
        error: 'Sign in again before performing this sensitive administrative action.',
      }),
    };
  }

  const rateLimit = await c.user.rpc('check_rate_limit', {
    p_action: 'onboarding',
    p_actor_identifier: profile.id,
    p_max: 30,
    p_window_seconds: 60,
  });
  if (rateLimit.error || !rateLimit.data) {
    return { error: json(429, { error: 'Too many administrative requests. Try again shortly.' }) };
  }

  return { ...c, caller: profile };
}

async function auditServerAction(ctx, action, targetType, targetId, detail = {}) {
  const { error } = await ctx.admin.rpc('write_server_audit_event', {
    p_actor_profile_id: ctx.caller.id,
    p_action: action,
    p_target_type: targetType,
    p_target_id: targetId || null,
    p_outcome: 'success',
    p_detail: detail,
  });
  if (error) throw new Error('The administrative action completed but could not be audited.');
}

async function requireInvitationRateLimit(ctx) {
  const result = await ctx.user.rpc('check_rate_limit', {
    p_action: 'invitation',
    p_actor_identifier: ctx.caller.id,
    p_max: 10,
    p_window_seconds: 60,
  });
  return !result.error && Boolean(result.data);
}

async function sendInitialTenantAdminInvitation(ctx, email, fullName, redirectTo) {
  const { data: orphanAuthUser, error: lookupError } = await ctx.user.rpc(
    'platform_find_unprofiled_auth_user',
    { p_email: email },
  );
  if (lookupError) {
    return {
      error: json(500, {
        error:
          'Invitation setup is unavailable because the required database update has not been applied.',
      }),
    };
  }

  if (orphanAuthUser?.id) {
    if (orphanAuthUser.emailConfirmed) {
      const unbanned = await ctx.admin.auth.admin.updateUserById(orphanAuthUser.id, {
        ban_duration: 'none',
        user_metadata: { full_name: fullName },
      });
      if (unbanned.error) {
        return {
          error: json(400, {
            error:
              'The email belongs to an unfinished account, but SafeBus could not prepare it for another invitation.',
          }),
        };
      }
      const recovered = await ctx.admin.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (recovered.error) {
        return {
          error: json(400, {
            error:
              'The invitation email was not sent. No tenant was created. Retry later or use another administrator email.',
          }),
        };
      }
      return {
        userId: orphanAuthUser.id,
        status: 'recovery_sent',
        createdAuthUser: false,
      };
    }

    // An unconfirmed orphan has no SafeBus profile or accepted identity. Remove
    // the stale provider row so Supabase can issue a fresh invite token and use
    // the normal Invite User email template.
    const removed = await ctx.admin.auth.admin.deleteUser(orphanAuthUser.id);
    if (removed.error) {
      return {
        error: json(400, {
          error:
            'The email belongs to an unfinished account that could not be safely replaced. No invitation was sent.',
        }),
      };
    }
    const options = { data: { full_name: fullName } };
    if (redirectTo) options.redirectTo = redirectTo;
    const reinvited = await ctx.admin.auth.admin.inviteUserByEmail(email, options);
    if (reinvited.error || !reinvited.data?.user?.id) {
      return {
        error: json(400, {
          error:
            'The invitation email was not sent. No tenant was created. Retry later or use another administrator email.',
        }),
      };
    }
    return {
      userId: reinvited.data.user.id,
      status: 'sent',
      createdAuthUser: true,
    };
  }

  const options = { data: { full_name: fullName } };
  if (redirectTo) options.redirectTo = redirectTo;
  const invited = await ctx.admin.auth.admin.inviteUserByEmail(email, options);
  if (invited.error || !invited.data?.user?.id) {
    return {
      error: json(409, {
        error:
          'The invitation email was not sent and no tenant was created. This email may already belong to another SafeBus account.',
      }),
    };
  }
  return {
    userId: invited.data.user.id,
    status: 'sent',
    createdAuthUser: true,
  };
}

async function sendInvitedPasswordSetup(ctx, { userId, email, redirectTo }) {
  const normalizedEmail = clean(email).toLowerCase();
  const { data: authData, error: authLookupError } =
    await ctx.admin.auth.admin.getUserById(userId);
  const authUser = authData?.user;

  if (
    authLookupError ||
    !authUser ||
    authUser.id !== userId ||
    clean(authUser.email).toLowerCase() !== normalizedEmail
  ) {
    return { error: 'The invited Auth account could not be verified.' };
  }

  const attributes = { ban_duration: 'none' };
  if (!authUser.email_confirmed_at) attributes.email_confirm = true;

  const prepared = await ctx.admin.auth.admin.updateUserById(userId, attributes);
  if (prepared.error) {
    return { error: 'The invited Auth account could not be prepared for password setup.' };
  }

  const recovery = await ctx.admin.auth.resetPasswordForEmail(
    normalizedEmail,
    redirectTo ? { redirectTo } : undefined,
  );
  if (recovery.error) {
    return { error: passwordSetupDeliveryError(recovery.error) };
  }

  return { error: null };
}

async function sendTenantMemberInvitation(ctx, { email, fullName, redirectTo, role, tenantId }) {
  const { data: accountState, error: stateError } = await ctx.admin.rpc(
    'server_get_member_invitation_state',
    { p_email: email },
  );
  if (stateError) {
    return {
      error: json(500, {
        error:
          'Member invitations are unavailable because the required database update has not been applied.',
      }),
    };
  }

  if (accountState?.profileId) {
    if (accountState.profileTenantId !== tenantId || accountState.profileRole !== role) {
      return {
        error: json(409, {
          error: 'That email is already linked to a different SafeBus tenant or role.',
        }),
      };
    }
    if (accountState.profileStatus === 'active') {
      return {
        error: json(409, {
          error: 'That member account is already active. No invitation was sent.',
        }),
      };
    }
    if (accountState.profileStatus !== 'invited') {
      return {
        error: json(409, {
          error:
            'That member account is suspended or disabled. Reactivate it before sending another invitation.',
        }),
      };
    }
  }

  if (accountState?.authUserId && accountState.profileId) {
    const passwordSetup = await sendInvitedPasswordSetup(ctx, {
      userId: accountState.authUserId,
      email,
      redirectTo,
    });
    if (passwordSetup.error) {
      return {
        error: json(400, {
          error: `${passwordSetup.error} The existing member record was preserved.`,
        }),
      };
    }
    return {
      userId: accountState.authUserId,
      status: 'recovery_sent',
      createdAuthUser: false,
    };
  }

  if (accountState?.authUserId && accountState.emailConfirmed) {
    const passwordSetup = await sendInvitedPasswordSetup(ctx, {
      userId: accountState.authUserId,
      email,
      redirectTo,
    });
    if (passwordSetup.error) {
      return { error: json(400, { error: passwordSetup.error }) };
    }
    return {
      userId: accountState.authUserId,
      status: 'recovery_sent',
      createdAuthUser: false,
    };
  }

  if (accountState?.authUserId) {
    const removed = await ctx.admin.auth.admin.deleteUser(accountState.authUserId);
    if (removed.error) {
      return {
        error: json(400, {
          error:
            'SafeBus found an unfinished member account that could not be safely replaced. No invitation was sent.',
        }),
      };
    }
  }

  const options = { data: { full_name: fullName } };
  if (redirectTo) options.redirectTo = redirectTo;
  const invited = await ctx.admin.auth.admin.inviteUserByEmail(email, options);
  if (invited.error || !invited.data?.user?.id) {
    return {
      error: json(409, {
        error:
          'The member invitation email was not sent and no member was added. This email may already belong to another SafeBus account.',
      }),
    };
  }
  return {
    userId: invited.data.user.id,
    status: 'sent',
    createdAuthUser: true,
  };
}

async function createTenant(event, body) {
  const ctx = await requireCaller(event, ['platform_super_admin']);
  if (ctx.error) return ctx.error;
  const tenantName = clean(body.tenantName);
  const tenantType = clean(body.tenantType) || 'school';
  const schoolName = clean(body.schoolName);
  const city = clean(body.city);
  const adminName = clean(body.adminName);
  const email = clean(body.adminEmail).toLowerCase();
  if (!tenantName || !adminName || !email) {
    return json(400, {
      error: 'Tenant name, admin name, and admin email are required. No invitation was sent.',
    });
  }
  if (
    tenantName.length > 200 ||
    schoolName.length > 200 ||
    city.length > 100 ||
    adminName.length > 200 ||
    email.length > 320 ||
    !EMAIL_PATTERN.test(email)
  ) {
    return json(400, {
      error: 'Enter valid tenant and administrator details. No invitation was sent.',
    });
  }

  if (!(await requireInvitationRateLimit(ctx))) {
    return json(429, { error: 'Too many invitation requests. Try again shortly.' });
  }
  const redirectTo = await invitationRedirectUrl(ctx);
  const invitation = await sendInitialTenantAdminInvitation(ctx, email, adminName, redirectTo);
  if (invitation.error) return invitation.error;

  const { data: setup, error: setupError } = await ctx.user.rpc(
    'platform_finalize_tenant_invitation',
    {
      p_auth_user_id: invitation.userId,
      p_tenant_name: tenantName,
      p_tenant_type: tenantType,
      p_school_name: schoolName || null,
      p_city: city || null,
      p_admin_name: adminName,
      p_admin_email: email,
    },
  );
  if (setupError || !setup?.tenant?.id) {
    if (invitation.createdAuthUser) {
      await ctx.admin.auth.admin.deleteUser(invitation.userId);
    }
    return json(500, {
      error:
        'The invitation could not be completed, so the tenant was not created. Retry the onboarding request.',
    });
  }

  return json(200, {
    ...setup,
    invitationStatus: invitation.status,
    recipientEmail: email,
  });
}

async function inviteMember(event, body) {
  const ctx = await requireCaller(event, ['tenant_admin']);
  if (ctx.error) return ctx.error;
  const role = clean(body.role);
  if (!MEMBER_ROLES.has(role))
    return json(400, { error: 'Only driver or guardian invitations are supported here.' });
  const tenantId = ctx.caller.tenant_id;
  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const fullName = `${firstName} ${lastName}`.trim();
  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone);
  if (!tenantId || !firstName || !lastName || !email || !phone) {
    return json(400, { error: 'First name, last name, email, and phone are required.' });
  }
  if (
    firstName.length > 100 ||
    lastName.length > 100 ||
    email.length > 320 ||
    phone.length > 40 ||
    !EMAIL_PATTERN.test(email)
  ) {
    return json(400, { error: 'Enter valid guardian or driver contact details.' });
  }
  let driverDetails = null;
  if (role === 'driver') {
    const licenseNumber = clean(body.licenseNumber).toUpperCase();
    const licenseIssueDate = clean(body.licenseIssueDate);
    const licenseExpiryDate = clean(body.licenseExpiryDate);
    const licenseClass = clean(body.licenseClass);
    const addressLine1 = clean(body.addressLine1);
    const addressLine2 = clean(body.addressLine2);
    const city = clean(body.city);
    const province = clean(body.province).toUpperCase() || 'AB';
    const postalCode = clean(body.postalCode).toUpperCase();
    if (
      !licenseNumber ||
      !licenseIssueDate ||
      !licenseExpiryDate ||
      !licenseClass ||
      !addressLine1 ||
      !city ||
      !province ||
      !postalCode
    ) {
      return json(400, {
        error: 'Driver licence dates, class, number, and mailing address are required.',
      });
    }
    if (
      licenseNumber.length > 64 ||
      addressLine1.length > 160 ||
      addressLine2.length > 160 ||
      city.length > 100 ||
      province.length > 2 ||
      !ISO_DATE_PATTERN.test(licenseIssueDate) ||
      !ISO_DATE_PATTERN.test(licenseExpiryDate) ||
      licenseExpiryDate < licenseIssueDate ||
      !ALBERTA_LICENSE_CLASSES.has(licenseClass) ||
      !CANADIAN_POSTAL_CODE_PATTERN.test(postalCode)
    ) {
      return json(400, { error: 'Enter valid Alberta driver licence and address details.' });
    }
    driverDetails = {
      license_number: licenseNumber,
      license_issue_date: licenseIssueDate,
      license_expiry_date: licenseExpiryDate,
      license_class: licenseClass,
      address_line1: addressLine1,
      address_line2: addressLine2 || null,
      city,
      province,
      postal_code: postalCode.replace(/\s+/g, '').replace(/^(.{3})(.{3})$/, '$1 $2'),
    };
  }

  const studentLinks = Array.isArray(body.studentLinks)
    ? body.studentLinks.map((link) => ({
        studentId: clean(link?.studentId),
        relationship: clean(link?.relationship) || 'guardian',
      }))
    : [];
  if (studentLinks.length > 20) {
    return json(400, { error: 'Link at most 20 students in one guardian invitation.' });
  }
  if (
    role === 'guardian' &&
    studentLinks.some((link) => !link.studentId || !GUARDIAN_RELATIONSHIPS.has(link.relationship))
  ) {
    return json(400, {
      error: 'A selected student or relationship is invalid. No invitation was sent.',
    });
  }

  if (!(await requireInvitationRateLimit(ctx))) {
    return json(429, { error: 'Too many invitation requests. Try again shortly.' });
  }
  const invitation = await sendTenantMemberInvitation(ctx, {
    email,
    fullName,
    redirectTo: await invitationRedirectUrl(ctx),
    role,
    tenantId,
  });
  if (invitation.error) return invitation.error;

  const { data: finalized, error: finalizeError } = await ctx.user.rpc(
    'admin_finalize_member_invitation',
    {
      p_auth_user_id: invitation.userId,
      p_role: role,
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: email,
      p_phone: phone,
      p_driver_details: driverDetails,
      p_student_links: role === 'guardian' ? studentLinks : [],
    },
  );
  if (finalizeError || !finalized?.profileId) {
    if (invitation.createdAuthUser) {
      await ctx.admin.auth.admin.deleteUser(invitation.userId);
    }
    const safeFinalizeMessage = typeof finalizeError?.message === 'string' && (
      finalizeError.message.includes('A driver with this driving licence number already exists.') ||
      finalizeError.message.includes('A driver with this email address already exists.') ||
      finalizeError.message.includes('A driver with this phone number already exists.') ||
      finalizeError.message.includes('That email is already linked to a different SafeBus tenant or role.') ||
      finalizeError.message.includes('That email is already linked to another SafeBus profile.')
    )
      ? finalizeError.message.replace('That email is already linked to a different SafeBus tenant or role.', 'A driver with this email address already exists. Use a different email address or select the existing driver.').replace('That email is already linked to another SafeBus profile.', 'A driver with this email address already exists. Use a different email address or select the existing driver.')
      : 'The email provider accepted the invitation, but SafeBus could not create the member record. No member was added; retry the invitation.';
    return json(400, { error: safeFinalizeMessage });
  }

  return json(200, {
    status: invitation.status,
    guardianId: finalized.guardianId ?? null,
    driverId: finalized.driverId ?? null,
    recipientEmail: email,
  });
}

async function tenantLifecycle(event, body) {
  const ctx = await requireCaller(event, ['platform_super_admin']);
  if (ctx.error) return ctx.error;
  const tenantId = clean(body.tenantId);
  const status = clean(body.status);
  if (!['active', 'suspended', 'disabled'].includes(status))
    return json(400, { error: 'Unsupported tenant status.' });
  if (!tenantId) return json(400, { error: 'Tenant is required.' });
  const { data, error } = await ctx.user.rpc('platform_set_tenant_lifecycle', {
    p_tenant_id: tenantId,
    p_status: status,
  });
  if (error) return json(400, { error: error.message || 'Unable to update tenant status.' });
  return json(200, data);
}

async function inviteAdministrator(event, body) {
  const ctx = await requireCaller(event, ['tenant_admin']);
  if (ctx.error) return ctx.error;

  const fullName = clean(body.fullName);
  const email = clean(body.email).toLowerCase();
  const role = clean(body.role);
  const schoolId = clean(body.schoolId) || null;

  if (!fullName || !email || !role) {
    return json(400, { error: 'Full name, email, and role are required.' });
  }
  if (fullName.length > 200 || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    return json(400, { error: 'Enter valid administrator details.' });
  }
  if (!['tenant_admin', 'school_admin', 'transportation_admin'].includes(role)) {
    return json(400, { error: 'Only administrative roles are supported.' });
  }
  if (role === 'school_admin' && !schoolId) {
    return json(400, { error: 'A school assignment is required for a school administrator.' });
  }
  if (role === 'school_admin') {
    const { data: school, error: schoolError } = await ctx.admin
      .from('schools')
      .select('id')
      .eq('id', schoolId)
      .eq('tenant_id', ctx.caller.tenant_id)
      .eq('status', 'active')
      .maybeSingle();
    if (schoolError || !school) {
      return json(400, { error: 'Select an active school in your tenant.' });
    }
  }

  if (!(await requireInvitationRateLimit(ctx))) {
    return json(429, { error: 'Too many invitation requests. Try again shortly.' });
  }

  const redirectTo = await invitationRedirectUrl(ctx);
  const invitation = await sendTenantMemberInvitation(ctx, {
    email,
    fullName,
    redirectTo,
    role,
    tenantId: ctx.caller.tenant_id,
  });
  if (invitation.error) return invitation.error;

  // Call the appropriate RPC based on role.
  const rpcName = role === 'tenant_admin' ? 'tenant_invite_administrator' : 'tenant_add_sub_administrator';
  const rpcParams =
    role === 'tenant_admin'
      ? {
          p_tenant_id: ctx.caller.tenant_id,
          p_auth_user_id: invitation.userId,
          p_full_name: fullName,
          p_email: email,
        }
      : {
          p_auth_user_id: invitation.userId,
          p_role: role,
          p_full_name: fullName,
          p_email: email,
          p_school_id: schoolId,
        };

  const { data: finalized, error: finalizeError } = await ctx.user.rpc(rpcName, rpcParams);
  if (finalizeError || !finalized?.profileId) {
    if (invitation.createdAuthUser) {
      await ctx.admin.auth.admin.deleteUser(invitation.userId);
    }
    return json(400, {
      error: typeof finalizeError?.message === 'string' ? finalizeError.message : 'The administrator invitation could not be finalized.',
    });
  }

  return json(200, {
    profileId: finalized.profileId,
    tenantId: finalized.tenantId,
    status: invitation.status,
    recipientEmail: email,
  });
}

async function emergencyRecoveryAction(event, body) {
  const ctx = await requireCaller(event, ['platform_super_admin']);
  if (ctx.error) return ctx.error;

  const profileId = clean(body.profileId);
  const tenantId = clean(body.tenantId);
  if (!profileId || !tenantId) {
    return json(400, { error: 'Profile ID and tenant ID are required.' });
  }

  const { data, error } = await ctx.user.rpc('platform_emergency_admin_recovery', {
    p_profile_id: profileId,
    p_tenant_id: tenantId,
  });
  if (error) {
    return json(400, { error: error.message || 'Emergency recovery failed.' });
  }

  const unbanned = await ctx.admin.auth.admin.updateUserById(profileId, { ban_duration: 'none' });
  if (unbanned.error) {
    return json(500, {
      error: 'The administrator was recovered, but Auth sign-in enabling must be retried.',
      profileRecovered: true,
    });
  }

  return json(200, data);
}

async function departAdministratorAction(event, body) {
  const ctx = await requireCaller(event, ['tenant_admin']);
  if (ctx.error) return ctx.error;
  const profileId = clean(body.profileId);
  if (!profileId) return json(400, { error: 'Administrator is required.' });

  const { data, error } = await ctx.user.rpc('tenant_depart_administrator', {
    p_profile_id: profileId,
  });
  if (error) return json(400, { error: error.message || 'Unable to process departure.' });
  const banned = await ctx.admin.auth.admin.updateUserById(profileId, { ban_duration: '876000h' });
  if (banned.error) {
    return json(500, {
      error: 'The administrator was disabled, but Auth sign-in blocking must be retried.',
      profileDisabled: true,
    });
  }
  return json(200, data);
}

async function suspendAdministratorAction(event, body) {
  const ctx = await requireCaller(event, ['tenant_admin']);
  if (ctx.error) return ctx.error;
  const profileId = clean(body.profileId);
  if (!profileId) return json(400, { error: 'Administrator is required.' });
  const { data, error } = await ctx.user.rpc('tenant_suspend_administrator', {
    p_profile_id: profileId,
  });
  if (error) return json(400, { error: error.message || 'Unable to suspend administrator.' });
  const banned = await ctx.admin.auth.admin.updateUserById(profileId, { ban_duration: '876000h' });
  if (banned.error) {
    return json(500, {
      error: 'The administrator was suspended, but Auth sign-in blocking must be retried.',
      profileSuspended: true,
    });
  }
  return json(200, data);
}

async function restoreAdministratorAction(event, body) {
  const ctx = await requireCaller(event, ['tenant_admin']);
  if (ctx.error) return ctx.error;
  const profileId = clean(body.profileId);
  if (!profileId) return json(400, { error: 'Administrator is required.' });

  const { data, error } = await ctx.user.rpc('tenant_restore_administrator', {
    p_profile_id: profileId,
  });
  if (error) return json(400, { error: error.message || 'Unable to restore administrator.' });
  const unbanned = await ctx.admin.auth.admin.updateUserById(profileId, { ban_duration: 'none' });
  if (unbanned.error) {
    return json(500, {
      error: 'The administrator was restored, but Auth sign-in enabling must be retried.',
      profileRestored: true,
    });
  }
  return json(200, data);
}

function responseErrorMessage(response, fallback) {
  try {
    const parsed = JSON.parse(response?.body || '{}');
    return clean(parsed?.error) || fallback;
  } catch {
    return fallback;
  }
}

async function bulkInvitationDispatch(event, body) {
  const ctx = await requireCaller(event, ['tenant_admin']);
  if (ctx.error) return ctx.error;
  const batchId = clean(body.batchId);
  const requestedLimit = Number(body.limit ?? 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 25) : 10;
  if (!batchId) return json(400, { error: 'Import batch is required.' });

  const { data: claimed, error: claimError } = await ctx.user.rpc('claim_bulk_invitation_rows', {
    p_batch_id: batchId,
    p_limit: limit,
  });
  if (claimError) return json(400, { error: claimError.message || 'Unable to claim invitations.' });

  let sent = 0;
  let failed = 0;
  for (const row of claimed ?? []) {
    const rowData = row?.row_data ?? {};
    const role = clean(row?.role);
    const firstName = clean(rowData.first_name);
    const lastName = clean(rowData.last_name);
    const email = clean(row?.email).toLowerCase();
    const phone = clean(rowData.phone);
    const invitation = await sendTenantMemberInvitation(ctx, {
      email,
      fullName: clean(row?.full_name),
      redirectTo: await invitationRedirectUrl(ctx),
      role,
      tenantId: ctx.caller.tenant_id,
    });

    if (invitation.error) {
      failed += 1;
      await ctx.admin.rpc('reconcile_bulk_invitation_delivery', {
        p_queue_invitation_id: row.invitation_id,
        p_profile_id: null,
        p_error: responseErrorMessage(invitation.error, 'Invitation provider rejected this recipient.'),
      });
      continue;
    }

    const driverDetails = role === 'driver'
      ? {
          license_number: clean(rowData.license_number),
          license_class: clean(rowData.license_class),
          license_issue_date: clean(rowData.license_issue_date),
          license_expiry_date: clean(rowData.license_expiry_date),
          address_line1: clean(rowData.address_line1),
          address_line2: clean(rowData.address_line2) || null,
          city: clean(rowData.city),
          province: clean(rowData.province),
          postal_code: clean(rowData.postal_code),
        }
      : null;
    const { data: finalized, error: finalizeError } = await ctx.user.rpc(
      'admin_finalize_member_invitation',
      {
        p_auth_user_id: invitation.userId,
        p_role: role,
        p_first_name: firstName,
        p_last_name: lastName,
        p_email: email,
        p_phone: phone,
        p_driver_details: driverDetails,
        p_student_links: [],
      },
    );

    if (finalizeError || !finalized?.profileId) {
      if (invitation.createdAuthUser) await ctx.admin.auth.admin.deleteUser(invitation.userId);
      failed += 1;
      await ctx.admin.rpc('reconcile_bulk_invitation_delivery', {
        p_queue_invitation_id: row.invitation_id,
        p_profile_id: null,
        p_error: 'The invitation was accepted but the member record could not be finalized.',
      });
      continue;
    }

    const reconciled = await ctx.admin.rpc('reconcile_bulk_invitation_delivery', {
      p_queue_invitation_id: row.invitation_id,
      p_profile_id: finalized.profileId,
      p_error: null,
    });
    if (reconciled.error) {
      failed += 1;
      continue;
    }
    sent += 1;
  }

  const { data: summary } = await ctx.user.rpc('get_bulk_invitation_delivery_summary', {
    p_batch_id: batchId,
  });
  return json(200, { batchId, claimed: claimed?.length ?? 0, sent, failed, summary: summary ?? {} });
}

async function action(event, body) {
  const ctx = await requireCaller(event, ['platform_super_admin', 'tenant_admin']);
  if (ctx.error) return ctx.error;
  const id = clean(body.invitationId);
  const next = clean(body.action);
  if (!id || !['resend', 'cancel', 'revoke'].includes(next)) {
    return json(400, { error: 'Invitation and supported action are required.' });
  }

  if (ctx.caller.role === 'platform_super_admin') {
    const { data: isFirstAdminInvitation, error: boundaryError } = await ctx.user.rpc(
      'platform_is_first_admin_invitation',
      { p_invitation_id: id },
    );
    if (boundaryError) return json(500, { error: 'Unable to verify the invitation boundary.' });
    if (isFirstAdminInvitation !== true) {
      return json(403, {
        error: 'Platform personnel can manage only the first tenant administrator invitation.',
      });
    }
  }

  const invitationClient = ctx.caller.role === 'platform_super_admin' ? ctx.admin : ctx.user;
  const { data: inv, error: invitationLookupError } = await invitationClient
    .from('tenant_onboarding_invitations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (invitationLookupError) {
    return json(500, { error: 'Unable to load the invitation.' });
  }
  if (!inv) return json(404, { error: 'Invitation not found.' });
  if (ctx.caller.role !== 'platform_super_admin' && inv.tenant_id !== ctx.caller.tenant_id) {
    return json(403, { error: 'Invitation is outside your tenant.' });
  }
  if (!['pending', 'resent', 'failed'].includes(inv.status)) {
    return json(409, { error: 'Only a pending invitation can be changed.' });
  }

  let invitedProfile = null;
  if (inv.invited_profile_id) {
    const { data, error } = await ctx.admin
      .from('profiles')
      .select('id, email, status')
      .eq('id', inv.invited_profile_id)
      .maybeSingle();
    if (error) return json(500, { error: 'Unable to verify the invited profile.' });
    if (
      !data ||
      data.status !== 'invited' ||
      clean(data.email).toLowerCase() !== clean(inv.email).toLowerCase()
    ) {
      return json(409, { error: 'The invited profile is no longer pending.' });
    }
    invitedProfile = data;
  }

  if (next === 'revoke') {
    if (ctx.caller.role !== 'tenant_admin') {
      return json(403, { error: 'Only the tenant can revoke this invitation.' });
    }
    const { data, error } = await ctx.user.rpc('revoke_invitation', {
      p_invitation_id: id,
    });
    if (error) return json(400, { error: error.message || 'Unable to revoke the invitation.' });
    if (inv.invited_profile_id) {
      const disabledAuth = await ctx.admin.auth.admin.updateUserById(inv.invited_profile_id, {
        ban_duration: '876000h',
      });
      if (disabledAuth.error) {
        return json(500, {
          error: 'The invitation was revoked, but Auth sign-in blocking must be retried.',
          invitationRevoked: true,
        });
      }
    }
    return json(200, data);
  }

  if (next === 'cancel') {
    if (ctx.caller.role !== 'platform_super_admin') {
      return json(403, { error: 'Tenant administrators must use the audited revoke workflow.' });
    }
    const { data, error } = await ctx.user.rpc('platform_cancel_first_admin_invitation', {
      p_invitation_id: id,
    });
    if (error) return json(400, { error: error.message || 'Unable to cancel the invitation.' });
    if (inv.invited_profile_id) {
      const disabledAuth = await ctx.admin.auth.admin.updateUserById(inv.invited_profile_id, {
        ban_duration: '876000h',
      });
      if (disabledAuth.error)
        return json(400, {
          error: 'The invitation was cancelled, but its sign-in link could not be disabled.',
        });
    }
    return json(200, data);
  }
  if (next === 'resend') {
    if (!inv.invited_profile_id || !invitedProfile) {
      return json(409, { error: 'Only a pending invitation can be resent.' });
    }

    if (!(await requireInvitationRateLimit(ctx))) {
      return json(429, { error: 'Too many invitation requests. Try again shortly.' });
    }
    const redirectTo = await invitationRedirectUrl(ctx);
    const passwordSetup = await sendInvitedPasswordSetup(ctx, {
      userId: inv.invited_profile_id,
      email: inv.email,
      redirectTo,
    });
    if (passwordSetup.error) return json(400, { error: passwordSetup.error });

    const { error: invitationUpdateError } = await ctx.admin
      .from('tenant_onboarding_invitations')
      .update({
        status: 'resent',
        last_sent_at: new Date().toISOString(),
        cancelled_at: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        delivery_status: 'sent',
        last_delivery_error: null,
      })
      .eq('id', id);
    if (invitationUpdateError) {
      return json(500, {
        error: 'The password setup email was sent, but its invitation status was not updated.',
      });
    }
    await auditServerAction(ctx, 'invitation.resent', 'invitation', inv.id);
    return json(200, { status: 'resent' });
  }
  return json(400, { error: 'Unsupported action.' });
}

export async function handler(event) {
  let requestKind = 'unknown';
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
    const body = JSON.parse(event.body || '{}');
    requestKind = clean(body.kind) || 'unknown';
    // Await every action inside this try/catch so asynchronous failures are
    // converted into a safe JSON response instead of escaping to the runtime.
    if (body.kind === 'createTenant') return await createTenant(event, body);
    if (body.kind === 'inviteMember') return await inviteMember(event, body);
    if (body.kind === 'invitationAction') return await action(event, body);
    if (body.kind === 'tenantLifecycle') return await tenantLifecycle(event, body);
    if (body.kind === 'inviteAdministrator') return await inviteAdministrator(event, body);
    if (body.kind === 'emergencyRecovery') return await emergencyRecoveryAction(event, body);
    if (body.kind === 'departAdministrator') return await departAdministratorAction(event, body);
    if (body.kind === 'suspendAdministrator') return await suspendAdministratorAction(event, body);
    if (body.kind === 'restoreAdministrator') return await restoreAdministratorAction(event, body);
    if (body.kind === 'bulkInvitationDispatch') return await bulkInvitationDispatch(event, body);
    return json(400, { error: 'Unknown onboarding action.' });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error(
      JSON.stringify({
        event: 'safebus_onboarding_failed',
        kind: requestKind,
        errorName,
      }),
    );
    if (errorName === 'TimeoutError' || errorName === 'AbortError') {
      return json(504, {
        error:
          'The invitation service timed out before SafeBus could confirm completion. No new member was confirmed; retry once.',
      });
    }
    if (errorName === 'OnboardingConfigurationError') {
      return json(503, {
        error:
          'Server onboarding is not configured. Add SUPABASE_SECRET_KEY to apps/web/.env and restart the local dev server.',
      });
    }
    return json(500, {
      error: 'The onboarding request failed before it could complete. No new member was confirmed.',
    });
  }
}
