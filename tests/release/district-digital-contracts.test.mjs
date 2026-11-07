import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const read=path=>fs.readFile(path,'utf8');
const migration='supabase/migrations/pending/20261107154500_district_digital_agreements.sql';

test('new district agreement gate is fail-closed, prior tenants exempt, activation separately protected',async()=>{
  const s=await read(migration);
  assert.match(s,/update public\.tenants set agreement_gate_required = false/);
  assert.match(s,/alter table public\.tenants alter column agreement_gate_required set default true/);
  assert.match(s,/create table safebus_private\.district_activation_release_control/);
  assert.match(s,/c\.tenant_id=p_tenant_id and c\.bundle_sha256=p_bundle_sha256 and c\.approved/);
  assert.match(s,/approved_refs_sha256=encode\(digest/);
  assert.match(s,/create policy safebus_district_contract_gate on/);
  assert.match(s,/create function safebus_private\.enforce_district_contract_api/);
  assert.match(s,/perform safebus_private\.enforce_active_api_session\(\)/);
  assert.doesNotMatch(s,/create or replace function safebus_private\.current_user_role/);
  assert.doesNotMatch(s,/create or replace function safebus_private\.current_tenant_id/);
  assert.match(s,/enforce_tenant_agreement_gate_immutable/);
  assert.match(s,/where a\.tenant_id=p\.tenant_id and a\.status='active'/);
  assert.doesNotMatch(s,/grant (insert|update|delete|all) on table safebus_private\.district_agreement_packages to authenticated/i);
  assert.equal(s.split('create function public.platform_issue_district_agreement(').length,2);
  assert.equal(s.split('create function public.platform_activate_district_agreement(').length,2);
  assert.match(s,/No rows are inserted or approved by this preparation migration/);
});
test('signing requires verified authority, checked document digest, one-use token and explicit consent',async()=>{
  const s=await read(migration);
  for(const expected of [
   "v_s.authority_ref is null","v_s.verified_by is null",
   "v_s.token_used_at is not null","v_s.token_expires_at<=now()",
   "v_p.bundle_sha256 is distinct from p_bundle_sha256",
   "p_electronic_consent is distinct from true",
   "p_binding_authority is distinct from true",
   "token_sha256=null","status='customer_signed'",
   "p_provider_authority_ref","status='executed'"
  ]) assert.ok(s.includes(expected),expected);
  assert.match(s,/revoke all on function public.server_sign_district_agreement\([^\n]+\) from public,anon,authenticated/);
  assert.match(s,/grant execute on function public.server_sign_district_agreement\([^\n]+\) to service_role/);
});
test('signer tokens stay off app route URLs and are never serialized into messages',async()=>{
 const s=await read('apps/web/netlify/functions/district-agreements.mjs');
 const page=await read('apps/web/src/pages/DistrictAgreementSignerPage.tsx');
 assert.match(s,/randomBytes\(32\)\.toString\('base64url'\)/);
 assert.match(s,/signerTokenHash\(token\)/);
 assert.match(s,/\/agreements\/sign#token=/);
 assert.match(s,/server_revoke_district_signer_token/);
 assert.match(s,/server_get_district_signer_package/);
 assert.match(page,/window\.history\.replaceState/);
 assert.match(page,/bindingAuthority/);
 assert.match(page,/electronicConsent/);
 assert.match(page,/allReviewed/);
 assert.doesNotMatch(s,/console\.error\([^\n]*token/);
});
test('invitation billing and dashboard enforce district agreement instead of only client UI',async()=>{
 const invitation=await read('apps/web/src/pages/AcceptInvitationPage.tsx');
 const route=await read('apps/web/src/routes/ProtectedRoute.tsx');
 const bill=await read('apps/web/netlify/functions/billing-shared.mjs');
 const gate=await read('apps/web/src/routes/TenantAgreementGate.tsx');
 assert.match(invitation,/\/admin\/onboarding\/agreements/);
 assert.match(route,/TenantAgreementGate/);
 assert.match(bill,/get_district_agreement_status_secure/);
 assert.match(bill,/Complete the school authority agreement before billing/);
 assert.match(gate,/getTenantAgreementStatus/);
 assert.match(gate,/!agreementIsReady/);
});
test('SafeBus design tokens and no new school-role exposure',async()=>{
 const page=await read('apps/web/src/pages/DistrictAgreementsPage.tsx');
 assert.match(page,/var\(--color-action\)/);
 assert.match(page,/var\(--color-surface-subtle\)/);
 assert.match(page,/PageHeader/);
 assert.match(page,/DashboardLayout/);
 const router=await read('apps/web/src/routes/router.tsx');
 assert.match(router,/path: '\/agreements\/sign'/);
 assert.match(router,/allowedRoles=\{\['tenant_admin'\]\}/);
 assert.match(router,/allowedRoles=\{\['platform_super_admin'\]\}/);
 assert.doesNotMatch(router,/allowedRoles=\{\['school_admin'\]\}/);
});

test('unsigned agreement migration cannot change live billing or invitations when feature flags are absent',async()=>{
 const invite=await read('apps/web/src/pages/AcceptInvitationPage.tsx');
 const route=await read('apps/web/src/routes/ProtectedRoute.tsx');
 const bill=await read('apps/web/netlify/functions/billing-shared.mjs');
 const server=await read('apps/web/netlify/functions/district-agreements.mjs');
 assert.ok(invite.includes("VITE_SAFEBUS_DISTRICT_AGREEMENTS_ENABLED === 'true'"));
 assert.ok(invite.includes("'/admin/settings/billing'"));
 assert.ok(route.includes("VITE_SAFEBUS_DISTRICT_AGREEMENTS_ENABLED === 'true'"));
 assert.ok(bill.includes("SAFEBUS_DISTRICT_AGREEMENTS_ENABLED === 'true'"));
 assert.ok(server.includes("SAFEBUS_DISTRICT_AGREEMENTS_ENABLED !== 'true'"));
 assert.ok(server.includes("Digital school authority agreements have not been activated."));
});
