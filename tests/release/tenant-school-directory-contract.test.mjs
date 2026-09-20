import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/0100_tenant_school_directory.sql');

test('school lifecycle is tenant-admin owned and platform school access is removed', () => {
  assert.match(migration, /drop policy if exists "schools select platform admin"/i);
  assert.match(migration, /v_caller\.role <> 'tenant_admin'/i);
  assert.match(migration, /tenant_id = v_caller\.tenant_id/gi);
  assert.match(migration, /enforce_mfa_if_required\(\)/gi);
  assert.match(migration, /enforce_recent_auth_for_sensitive_action\(\)/gi);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete).*public\.schools/i);
});

test('user-facing deletion preserves transportation and historical records', () => {
  assert.match(migration, /set status = 'archived'/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.schools/i);
  assert.doesNotMatch(
    migration,
    /update\s+public\.(?:buses|routes|students|profiles|driver_trips)/i,
  );
  assert.match(migration, /School lifecycle never controls tenant or transportation access/i);
});

test('platform onboarding no longer accepts or creates a school', () => {
  const platformPage = read('apps/web/src/pages/PlatformTenantsPage.tsx');
  const onboarding = read('apps/web/netlify/functions/safebus-onboarding.mjs');

  assert.doesNotMatch(platformPage, /schoolName|Initial school name/i);
  assert.doesNotMatch(onboarding, /body\.schoolName|body\.city|p_city:\s*city/i);
  assert.match(onboarding, /p_school_name:\s*null[\s\S]*p_city:\s*null/i);
  assert.match(
    migration,
    /Legacy school arguments are ignored; school setup is exclusively tenant-owned/i,
  );
  const platformOnboarding = migration.slice(
    migration.indexOf('create or replace function public.platform_finalize_tenant_invitation'),
    migration.indexOf('create or replace function public.tenant_create_school'),
  );
  assert.doesNotMatch(platformOnboarding, /insert into public\.schools/i);
});

test('schools live under role-aware settings instead of global navigation', () => {
  const layout = read('apps/web/src/components/layout/DashboardLayout.tsx');
  const settingsNav = read('apps/web/src/components/settings/AdminSettingsNav.tsx');
  const router = read('apps/web/src/routes/router.tsx');

  assert.doesNotMatch(layout, /label: 'Schools'/);
  assert.match(settingsNav, /to: '\/admin\/settings\/schools'/);
  assert.match(router, /path: '\/admin\/settings\/schools'/);
  assert.match(router, /path: '\/admin\/schools'[\s\S]*Navigate to="\/admin\/settings\/schools"/);
});
