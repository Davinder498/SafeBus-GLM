import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('bulk onboarding uses supported rate-limit actions and schema-compatible commits', async () => {
  const [rateLimit, bulk] = await Promise.all([
    read('supabase/migrations/0067_phase2_mfa_recent_auth_allowlist_ratelimit.sql'),
    read('supabase/migrations/0076_phase5_bulk_onboarding_foundation.sql'),
  ]);
  assert.match(bulk, /'bulk_import', 'bulk_invitation'/);
  assert.match(bulk, /create or replace function public\.check_rate_limit/);
  assert.doesNotMatch(bulk, /insert into public\.students \([^)]*full_name/i);
  assert.doesNotMatch(bulk, /insert into public\.(guardians|drivers)\s*\(/i);
  assert.match(rateLimit, /p_action not in/);
});

test('tenant lifecycle endpoint delegates to the atomic database workflow', async () => {
  const [migration, handler] = await Promise.all([
    read('supabase/migrations/0075_phase5_tenant_administration_foundation.sql'),
    read('apps/web/netlify/functions/safebus-onboarding.mjs'),
  ]);
  assert.match(migration, /tenant_lifecycle_snapshot_entries/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(handler, /ctx\.user\.rpc\('platform_set_tenant_lifecycle'/);
  const lifecycleBody = handler.slice(
    handler.indexOf('async function tenantLifecycle'),
    handler.indexOf('async function inviteAdministrator'),
  );
  assert.doesNotMatch(lifecycleBody, /\.from\('profiles'\)|\.from\('drivers'\)|\.from\('guardians'\)/);
});

test('platform privacy and Phase 5 exit-gate coverage stay wired', async () => {
  const [adminMigration, invitationMigration, runner, exitGate] = await Promise.all([
    read('supabase/migrations/0075_phase5_tenant_administration_foundation.sql'),
    read('supabase/migrations/0077_phase5_invitation_lifecycle.sql'),
    read('scripts/run-rls-tests.mjs'),
    read('tests/rls/phase5-tenant-administration-rls.sql'),
  ]);
  assert.match(adminMigration, /Only a tenant administrator can search tenant audit events/);
  assert.doesNotMatch(adminMigration, /Platform super-admin searches across all tenants/);
  assert.match(adminMigration, /get_platform_tenant_onboarding_summary_secure/);
  assert.match(adminMigration, /drop policy if exists "audit_events select platform super admin"/);
  assert.match(adminMigration, /phase5_write_audit_event/);
  assert.doesNotMatch(adminMigration, /perform public\.write_server_audit_event/);
  assert.match(invitationMigration, /get_platform_first_admin_invitation_status/);
  assert.match(invitationMigration, /drop policy if exists "tenant onboarding select platform admin"/);
  assert.match(invitationMigration, /platform_is_first_admin_invitation/);
  assert.match(runner, /phase5-tenant-administration-rls\.sql/);
  assert.match(exitGate, /generate_series\(1, 10000\)/);
  assert.match(exitGate, /failed commit partially inserted/);
  assert.match(exitGate, /platform personnel can inspect imported tenant records/i);
});

test('bulk invitation queue is complete, idempotent, expiring, and student-free', async () => {
  const [queue, handler, netlify] = await Promise.all([
    read('supabase/migrations/0078_phase5_account_restoration_bulk_invitations.sql'),
    read('apps/web/netlify/functions/safebus-onboarding.mjs'),
    read('netlify.toml'),
  ]);
  assert.doesNotMatch(queue, /v_invited_count\s*>=\s*100/);
  assert.match(queue, /on conflict \(bulk_batch_id, source_row_number\)/i);
  assert.match(queue, /Students do not receive account invitations/);
  assert.match(handler, /async function bulkInvitationDispatch/);
  assert.match(handler, /p_student_links: \[\]/);
  assert.match(netlify, /safebus-invitation-expiry-scheduled/);
});
