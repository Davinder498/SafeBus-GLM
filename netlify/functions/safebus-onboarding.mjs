import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

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

async function inviteAuthUser(admin, email, fullName, redirectTo) {
  const options = { data: { full_name: fullName } };
  if (redirectTo) options.redirectTo = redirectTo;
  const invited = await admin.auth.admin.inviteUserByEmail(email, options);
  if (!invited.error) return { user: invited.data.user, status: 'sent' };
  const listed = await admin.auth.admin.listUsers();
  const existing = listed.data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return { user: existing, status: 'existing_email' };
  throw new Error('Unable to send invitation.');
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
  if (!tenantName || !adminName || !email) return json(400, { error: 'Tenant name, admin name, and admin email are required.' });

  const { data: tenant, error: tenantError } = await ctx.admin.from('tenants').insert({ name: tenantName, type: tenantType, status: 'active' }).select('id, name, status').single();
  if (tenantError) return json(400, { error: 'Unable to create tenant.' });
  let school = null;
  if (schoolName) {
    const { data, error } = await ctx.admin.from('schools').insert({ tenant_id: tenant.id, name: schoolName, city: city || null, province: 'AB', status: 'active' }).select('id, name').single();
    if (error) return json(400, { error: 'Tenant was created, but the initial school could not be created.' });
    school = data;
  }
  const redirectTo = process.env.SAFEBUS_INVITE_REDIRECT_URL;
  const invited = await inviteAuthUser(ctx.admin, email, adminName, redirectTo);
  const { error: profileError } = await ctx.admin.from('profiles').upsert({ id: invited.user.id, tenant_id: tenant.id, school_id: school?.id ?? null, full_name: adminName, email, role: 'tenant_admin', status: invited.user.last_sign_in_at ? 'active' : 'invited' }, { onConflict: 'id' });
  if (profileError) return json(400, { error: 'Tenant was created, but the admin profile could not be provisioned.' });
  await ctx.admin.from('tenant_onboarding_invitations').insert({ tenant_id: tenant.id, email, full_name: adminName, role: 'tenant_admin', status: invited.user.last_sign_in_at ? 'activated' : 'pending', invited_profile_id: invited.user.id, invited_by_profile_id: ctx.caller.id, last_sent_at: new Date().toISOString() });
  return json(200, { tenant, school, invitationStatus: invited.status });
}

async function inviteMember(event, body) {
  const ctx = await requireCaller(event, ['tenant_admin']);
  if (ctx.error) return ctx.error;
  const role = clean(body.role);
  if (!['driver', 'guardian'].includes(role)) return json(400, { error: 'Only driver or guardian invitations are supported here.' });
  const tenantId = ctx.caller.tenant_id;
  const fullName = clean(body.fullName);
  const email = clean(body.email).toLowerCase();
  if (!tenantId || !fullName || !email) return json(400, { error: 'Name and email are required.' });
  const { data: existingProfile } = await ctx.admin.from('profiles').select('id, tenant_id, role, status').eq('email', email).maybeSingle();
  if (existingProfile && (existingProfile.tenant_id !== tenantId || existingProfile.role !== role)) return json(409, { error: 'That email is already linked to a different SafeBus tenant or role. Use a separate pilot account.' });
  const invited = await inviteAuthUser(ctx.admin, email, fullName, process.env.SAFEBUS_INVITE_REDIRECT_URL);
  const profileStatus = invited.user.last_sign_in_at ? 'active' : 'invited';
  const { error: pError } = await ctx.admin.from('profiles').upsert({ id: invited.user.id, tenant_id: tenantId, school_id: null, full_name: fullName, email, role, status: profileStatus }, { onConflict: 'id' });
  if (pError) return json(400, { error: 'Unable to provision invited profile.' });
  if (role === 'driver') {
    await ctx.admin.from('drivers').upsert({ tenant_id: tenantId, profile_id: invited.user.id, phone: clean(body.phone) || null, employee_number: clean(body.employeeNumber) || null, status: 'active' }, { onConflict: 'profile_id,tenant_id' });
  } else {
    const { data: guardian, error: gError } = await ctx.admin.from('guardians').upsert({ tenant_id: tenantId, profile_id: invited.user.id, full_name: fullName, email, phone: clean(body.phone) || null, status: 'active' }, { onConflict: 'profile_id,tenant_id' }).select('id').single();
    if (gError) return json(400, { error: 'Unable to create guardian record.' });
    const links = Array.isArray(body.studentLinks) ? body.studentLinks : [];
    for (const link of links) {
      const studentId = clean(link.studentId); if (!studentId) continue;
      const { data: student } = await ctx.admin.from('students').select('id, tenant_id').eq('id', studentId).eq('tenant_id', tenantId).maybeSingle();
      if (student) await ctx.admin.from('student_guardians').upsert({ tenant_id: tenantId, student_id: student.id, guardian_id: guardian.id, relationship: clean(link.relationship) || 'guardian', status: 'active' }, { onConflict: 'student_id,guardian_id' });
    }
  }
  await ctx.admin.from('tenant_onboarding_invitations').insert({ tenant_id: tenantId, email, full_name: fullName, role, status: profileStatus === 'active' ? 'activated' : 'pending', invited_profile_id: invited.user.id, invited_by_profile_id: ctx.caller.id, last_sent_at: new Date().toISOString() });
  return json(200, { status: invited.status });
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

async function action(event, body) {
  const ctx = await requireCaller(event, ['platform_super_admin', 'tenant_admin']);
  if (ctx.error) return ctx.error;
  const id = clean(body.invitationId); const next = clean(body.action);
  const { data: inv } = await ctx.admin.from('tenant_onboarding_invitations').select('*').eq('id', id).maybeSingle();
  if (!inv) return json(404, { error: 'Invitation not found.' });
  if (ctx.caller.role !== 'platform_super_admin' && inv.tenant_id !== ctx.caller.tenant_id) return json(403, { error: 'Invitation is outside your tenant.' });
  if (next === 'cancel') { await ctx.admin.from('tenant_onboarding_invitations').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id); return json(200, { status: 'cancelled' }); }
  if (next === 'resend') { await inviteAuthUser(ctx.admin, inv.email, inv.full_name, process.env.SAFEBUS_INVITE_REDIRECT_URL); await ctx.admin.from('tenant_onboarding_invitations').update({ status: 'resent', last_sent_at: new Date().toISOString() }).eq('id', id); return json(200, { status: 'resent' }); }
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
    return json(400, { error: 'Unknown onboarding action.' });
  } catch (e) { return json(500, { error: e instanceof Error ? e.message : 'Onboarding failed.' }); }
}
