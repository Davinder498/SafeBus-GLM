import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CANADIAN_POSTAL_CODE_PATTERN = /^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i;
const MEMBER_ROLES = new Set(['driver', 'guardian']);
const ALBERTA_LICENSE_CLASSES = new Set(['1', '2', '3', '4', '5', '6', '7']);
const GUARDIAN_RELATIONSHIPS = new Set(['mother', 'father', 'guardian', 'caregiver', 'other']);

function invitationRedirectUrl(event) {
  const configured = clean(process.env.SAFEBUS_INVITE_REDIRECT_URL);
  const requestOrigin = clean(event.headers.origin || event.headers.Origin);
  const candidate = configured || requestOrigin;
  if (!candidate) return null;

  try {
    const redirect = new URL(candidate);
    redirect.pathname = '/accept-invitation';
    redirect.search = '';
    redirect.hash = '';
    return redirect.toString();
  } catch {
    throw new Error('Server invitation redirect is not a valid absolute URL.');
  }
}

function clients(token) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error('Server onboarding is not configured.');
  return {
    user: createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } }),
    admin: createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } }),
  };
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
  if (profileError || !profile || profile.status !== 'active' || !allowedRoles.includes(profile.role)) {
    return { error: json(403, { error: 'You are not allowed to perform this onboarding action.' }) };
  }
  return { ...c, caller: profile };
}

async function inviteAuthUser(admin, email, fullName, redirectTo, existingProfileId = null) {
  if (existingProfileId) {
    const existing = await admin.auth.admin.getUserById(existingProfileId);
    if (existing.error || !existing.data?.user) {
      throw new Error('The existing member account could not be verified.');
    }
    if (existing.data.user.last_sign_in_at) {
      return { user: existing.data.user, status: 'existing_email' };
    }
    const resent = await admin.auth.resend({
      type: 'signup',
      email,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
    if (resent.error) throw new Error('Unable to resend the member invitation.');
    return { user: existing.data.user, status: 'resent' };
  }

  const options = { data: { full_name: fullName } };
  if (redirectTo) options.redirectTo = redirectTo;
  const invited = await admin.auth.admin.inviteUserByEmail(email, options);
  if (!invited.error) return { user: invited.data.user, status: 'sent' };
  throw new Error('Unable to send invitation. The email may already belong to another SafeBus account.');
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

  const redirectTo = invitationRedirectUrl(event);
  const invitation = await sendInitialTenantAdminInvitation(
    ctx,
    email,
    adminName,
    redirectTo,
  );
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
  if (!MEMBER_ROLES.has(role)) return json(400, { error: 'Only driver or guardian invitations are supported here.' });
  const tenantId = ctx.caller.tenant_id;
  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const fullName = `${firstName} ${lastName}`.trim();
  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone);
  if (!tenantId || !firstName || !lastName || !email || !phone) {
    return json(400, { error: 'First name, last name, email, and phone are required.' });
  }
  if (firstName.length > 100 || lastName.length > 100 || email.length > 320 || phone.length > 40 || !EMAIL_PATTERN.test(email)) {
    return json(400, { error: 'Enter valid guardian or driver contact details.' });
  }
  const { data: existingProfile, error: existingProfileError } = await ctx.admin
    .from('profiles')
    .select('id, tenant_id, role, status')
    .eq('email', email)
    .maybeSingle();
  if (existingProfileError) return json(400, { error: 'Unable to verify the member email.' });
  if (existingProfile && (existingProfile.tenant_id !== tenantId || existingProfile.role !== role)) return json(409, { error: 'That email is already linked to a different SafeBus tenant or role. Use a separate pilot account.' });
  if (existingProfile && !['invited', 'active'].includes(existingProfile.status)) {
    return json(409, { error: 'That member account is suspended or disabled. Reactivate it before sending another invitation.' });
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
    if (!licenseNumber || !licenseIssueDate || !licenseExpiryDate || !licenseClass || !addressLine1 || !city || !province || !postalCode) {
      return json(400, { error: 'Driver licence dates, class, number, and mailing address are required.' });
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
    const { data: duplicateLicense, error: duplicateLicenseError } = await ctx.admin
      .from('drivers')
      .select('id, profile_id')
      .eq('tenant_id', tenantId)
      .eq('license_number', licenseNumber)
      .maybeSingle();
    if (duplicateLicenseError) return json(400, { error: 'Unable to verify the driver licence number.' });
    if (duplicateLicense && duplicateLicense.profile_id !== existingProfile?.id) {
      return json(409, { error: 'That driver licence number is already assigned in your organization.' });
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
  const invited = await inviteAuthUser(
    ctx.admin,
    email,
    fullName,
    invitationRedirectUrl(event),
    existingProfile?.id ?? null,
  );
  // An invitation link creates an Auth session before the invitee chooses a
  // password, so last_sign_in_at is not proof that onboarding is complete.
  // Only complete_invited_account() may transition an invited profile to active.
  const profileStatus = existingProfile?.status === 'active' ? 'active' : 'invited';
  const { error: pError } = await ctx.admin.from('profiles').upsert({ id: invited.user.id, tenant_id: tenantId, school_id: null, first_name: firstName, last_name: lastName, full_name: fullName, email, role, status: profileStatus }, { onConflict: 'id' });
  if (pError) return json(400, { error: 'Unable to provision invited profile.' });
  let guardianId = null;
  if (role === 'driver') {
    const { error: driverError } = await ctx.admin.from('drivers').upsert({ tenant_id: tenantId, profile_id: invited.user.id, phone, ...driverDetails, status: 'active' }, { onConflict: 'profile_id,tenant_id' });
    if (driverError) return json(400, { error: 'Unable to create driver record.' });
  } else {
    const { data: guardian, error: gError } = await ctx.admin.from('guardians').upsert({ tenant_id: tenantId, profile_id: invited.user.id, first_name: firstName, last_name: lastName, full_name: fullName, email, phone, status: 'active' }, { onConflict: 'profile_id,tenant_id' }).select('id').single();
    if (gError) return json(400, { error: 'Unable to create guardian record.' });
    guardianId = guardian.id;
    const links = Array.isArray(body.studentLinks) ? body.studentLinks : [];
    for (const link of links) {
      const studentId = clean(link.studentId); if (!studentId) continue;
      const { data: student } = await ctx.admin.from('students').select('id, tenant_id').eq('id', studentId).eq('tenant_id', tenantId).maybeSingle();
      const relationship = clean(link.relationship) || 'guardian';
      if (student && GUARDIAN_RELATIONSHIPS.has(relationship)) {
        const { error: linkError } = await ctx.user.rpc('admin_link_student_guardian', {
          p_student_id: student.id,
          p_guardian_id: guardian.id,
          p_relationship: relationship,
          p_can_receive_notifications: true,
        });
        if (linkError && !linkError.message?.includes('already linked')) {
          return json(400, { error: 'Guardian was invited, but the student link could not be created.' });
        }
      }
    }
  }
  const { error: invitationError } = await ctx.admin.from('tenant_onboarding_invitations').insert({ tenant_id: tenantId, email, full_name: fullName, role, status: profileStatus === 'active' ? 'activated' : 'pending', invited_profile_id: invited.user.id, invited_by_profile_id: ctx.caller.id, last_sent_at: new Date().toISOString() });
  if (invitationError) return json(400, { error: 'The member account was prepared, but the invitation audit record could not be saved.' });
  return json(200, { status: invited.status, guardianId });
}

async function tenantLifecycle(event, body) {
  const ctx = await requireCaller(event, ['platform_super_admin']);
  if (ctx.error) return ctx.error;
  const tenantId = clean(body.tenantId); const status = clean(body.status);
  if (!['active','suspended','disabled'].includes(status)) return json(400, { error: 'Unsupported tenant status.' });
  const { error } = await ctx.admin.from('tenants').update({ status }).eq('id', tenantId);
  if (error) return json(400, { error: 'Unable to update tenant status.' });
  if (status !== 'active') {
    await ctx.admin.from('profiles').update({ status: 'suspended' }).eq('tenant_id', tenantId).neq('role', 'platform_super_admin');
    await ctx.admin.from('drivers').update({ status: 'suspended' }).eq('tenant_id', tenantId).eq('status', 'active');
    await ctx.admin.from('guardians').update({ status: 'suspended' }).eq('tenant_id', tenantId).eq('status', 'active');
    await ctx.admin.from('driver_trips').update({ status: 'cancelled', ended_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('status', 'active');
  }
  return json(200, { status });
}

async function tenantAdminLifecycle(event, body) {
  const ctx = await requireCaller(event, ['platform_super_admin']);
  if (ctx.error) return ctx.error;

  const profileId = clean(body.profileId);
  const status = clean(body.status);
  if (!profileId || !['active', 'disabled'].includes(status)) {
    return json(400, { error: 'Tenant admin and supported account status are required.' });
  }

  const { data: profile, error: profileError } = await ctx.admin
    .from('profiles')
    .select('id, tenant_id, role, status')
    .eq('id', profileId)
    .maybeSingle();
  if (profileError || !profile || profile.role !== 'tenant_admin') {
    return json(404, { error: 'Tenant admin account not found.' });
  }
  if (profile.status === 'invited') {
    return json(409, {
      error:
        status === 'active'
          ? 'The tenant admin must accept the invitation and create a password first.'
          : 'Cancel the pending invitation instead of deactivating an account that is not active.',
    });
  }

  if (status === 'active') {
    const { data: tenant, error: tenantError } = await ctx.admin
      .from('tenants')
      .select('id, status')
      .eq('id', profile.tenant_id)
      .maybeSingle();
    if (tenantError || !tenant || tenant.status !== 'active') {
      return json(409, { error: 'Reactivate the tenant before reactivating its administrator.' });
    }
    const unbanned = await ctx.admin.auth.admin.updateUserById(profile.id, {
      ban_duration: 'none',
    });
    if (unbanned.error) return json(400, { error: 'Unable to reactivate the tenant admin sign-in.' });
    const { error: activateError } = await ctx.admin
      .from('profiles')
      .update({ status: 'active' })
      .eq('id', profile.id)
      .in('status', ['suspended', 'disabled']);
    if (activateError) return json(400, { error: 'Unable to reactivate the tenant admin profile.' });
    return json(200, { status: 'active' });
  }

  const { error: disableError } = await ctx.admin
    .from('profiles')
    .update({ status: 'disabled' })
    .eq('id', profile.id)
    .neq('status', 'invited');
  if (disableError) return json(400, { error: 'Unable to deactivate the tenant admin profile.' });
  const banned = await ctx.admin.auth.admin.updateUserById(profile.id, {
    ban_duration: '876000h',
  });
  if (banned.error) return json(400, { error: 'The profile was deactivated, but sign-in blocking must be retried.' });
  return json(200, { status: 'disabled' });
}

async function action(event, body) {
  const ctx = await requireCaller(event, ['platform_super_admin', 'tenant_admin']);
  if (ctx.error) return ctx.error;
  const id = clean(body.invitationId); const next = clean(body.action);
  const { data: inv } = await ctx.admin.from('tenant_onboarding_invitations').select('*').eq('id', id).maybeSingle();
  if (!inv) return json(404, { error: 'Invitation not found.' });
  if (ctx.caller.role !== 'platform_super_admin' && inv.tenant_id !== ctx.caller.tenant_id) return json(403, { error: 'Invitation is outside your tenant.' });
  if (next === 'cancel') {
    const { error: cancelError } = await ctx.admin.from('tenant_onboarding_invitations').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id);
    if (cancelError) return json(400, { error: 'Unable to cancel the invitation.' });
    if (inv.invited_profile_id) {
      const { error: disableProfileError } = await ctx.admin.from('profiles').update({ status: 'disabled' }).eq('id', inv.invited_profile_id).eq('status', 'invited');
      if (disableProfileError) return json(400, { error: 'The invitation was cancelled, but the invited profile could not be disabled.' });
      const disabledAuth = await ctx.admin.auth.admin.updateUserById(inv.invited_profile_id, { ban_duration: '876000h' });
      if (disabledAuth.error) return json(400, { error: 'The invitation was cancelled, but its sign-in link could not be disabled.' });
    }
    return json(200, { status: 'cancelled' });
  }
  if (next === 'resend') {
    const redirectTo = invitationRedirectUrl(event);
    const { error: resendError } = await ctx.admin.auth.resend({
      type: 'signup',
      email: inv.email,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
    if (resendError) return json(400, { error: 'Unable to resend the invitation.' });
    await ctx.admin.from('tenant_onboarding_invitations').update({ status: 'resent', last_sent_at: new Date().toISOString() }).eq('id', id);
    return json(200, { status: 'resent' });
  }
  return json(400, { error: 'Unsupported action.' });
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
    const body = JSON.parse(event.body || '{}');
    if (body.kind === 'createTenant') return createTenant(event, body);
    if (body.kind === 'inviteMember') return inviteMember(event, body);
    if (body.kind === 'invitationAction') return action(event, body);
    if (body.kind === 'tenantLifecycle') return tenantLifecycle(event, body);
    if (body.kind === 'tenantAdminLifecycle') return tenantAdminLifecycle(event, body);
    return json(400, { error: 'Unknown onboarding action.' });
  } catch (e) { return json(500, { error: e instanceof Error ? e.message : 'Onboarding failed.' }); }
}
