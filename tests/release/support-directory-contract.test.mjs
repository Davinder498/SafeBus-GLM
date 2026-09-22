import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const migrationPath = 'supabase/migrations/0107_support_directory.sql';

test('support directory uses tiered role-scoped contacts', async () => {
  const sql = await fs.readFile(migrationPath, 'utf8');
  assert.match(sql, /create table public\.platform_support_contacts/i);
  assert.match(sql, /create table public\.tenant_support_contacts/i);
  assert.match(sql, /alter table public\.platform_support_contacts enable row level security/i);
  assert.match(
    sql,
    /revoke all on public\.platform_support_contacts, public\.tenant_support_contacts from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /v_role in \('platform_super_admin', 'tenant_admin', 'school_admin', 'transportation_admin'\)[\s\S]*from public\.platform_support_contacts/i,
  );
  assert.match(
    sql,
    /v_role in \('tenant_admin', 'school_admin', 'transportation_admin', 'driver', 'guardian'\)[\s\S]*tenant_id = v_tenant_id/i,
  );
});

test('support writes are role restricted, recently authenticated, and audited', async () => {
  const sql = await fs.readFile(migrationPath, 'utf8');
  assert.match(sql, /current_user_role\(\) is distinct from 'platform_super_admin'/i);
  assert.match(sql, /current_user_role\(\) is distinct from 'tenant_admin'/i);
  assert.equal((sql.match(/enforce_recent_auth_for_sensitive_action\(\)/gi) ?? []).length, 2);
  assert.match(sql, /'platform_support\.updated'/i);
  assert.match(sql, /'tenant_support\.updated'/i);
  assert.doesNotMatch(
    sql,
    /grant\s+(?:select|insert|update|delete).*support_contacts.*authenticated/i,
  );
});

test('support pages are separated by platform, tenant, and mobile audiences', async () => {
  const [webRoutes, mobileRoutes, layout] = await Promise.all([
    fs.readFile('apps/web/src/routes/router.tsx', 'utf8'),
    fs.readFile('apps/mobile/src/routes/router.tsx', 'utf8'),
    fs.readFile('apps/web/src/components/layout/DashboardLayout.tsx', 'utf8'),
  ]);
  assert.match(webRoutes, /path: '\/admin\/platform-support'[\s\S]*platform_super_admin/i);
  assert.match(webRoutes, /path: '\/admin\/settings\/support'/i);
  assert.match(mobileRoutes, /path: '\/support'[\s\S]*allowedRoles=\{\['driver', 'guardian'\]\}/i);
  assert.match(layout, /onClick=\{\(\) => navigate\('\/support'\)\}/i);
});
