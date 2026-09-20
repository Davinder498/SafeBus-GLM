import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/0099_annual_per_bus_subscription_management.sql');

test('subscription records are private, role-filtered, and operationally independent', () => {
  assert.match(migration, /create table safebus_private\.tenant_billing_accounts/i);
  assert.match(migration, /create table safebus_private\.tenant_subscription_projections/i);
  assert.match(migration, /enable row level security/gi);
  assert.match(migration, /revoke all on all tables in schema safebus_private/);
  assert.match(migration, /current_user_role\(\) <> 'tenant_admin'/);
  assert.match(migration, /is_platform_super_admin\(\)/);
  assert.match(migration, /has_verified_mfa\(\)/);
  assert.match(migration, /'billing_read', 'billing_mutation', 'billing_portal'/);
  assert.doesNotMatch(migration, /update\s+public\.tenants\s+set\s+status/i);
  assert.doesNotMatch(migration, /card_number|bank_account|payment_method_id/i);
});

test('server billing boundaries verify signatures, idempotency, and approved prices', () => {
  const shared = read('apps/web/netlify/functions/billing-shared.mjs');
  const platform = read('apps/web/netlify/functions/platform-subscriptions.mjs');
  const webhook = read('apps/web/netlify/functions/stripe-webhook.mjs');
  assert.match(webhook, /constructEvent/);
  assert.match(webhook, /billing_begin_webhook_event/);
  assert.match(platform, /billing_begin_mutation/);
  assert.match(platform, /billing_upsert_customer_mapping/);
  assert.match(platform, /idempotencyKey/);
  assert.match(shared, /price\.recurring\?\.interval !== 'year'/);
  assert.match(shared, /price\.currency !== 'cad'/);
  assert.match(shared, /usage_type !== 'licensed'/);
  assert.doesNotMatch(shared + platform + webhook, /VITE_STRIPE/);
});

test('billing routes have the intended role boundaries and mobile remains unchanged', () => {
  const router = read('apps/web/src/routes/router.tsx');
  assert.match(router, /path: '\/admin\/subscription'[\s\S]*allowedRoles=\{\['tenant_admin'\]\}/);
  assert.match(
    router,
    /path: '\/admin\/tenants\/:tenantId'[\s\S]*allowedRoles=\{\['platform_super_admin'\]\}/,
  );
  const mobileRouter = read('apps/mobile/src/routes/router.tsx');
  assert.doesNotMatch(mobileRouter, /subscription|tenants\/:tenantId/);
});

test('web bus mark is 1.5 times larger while native sizing remains overridden', () => {
  const brand = read('apps/web/src/components/ui/BrandMark.tsx');
  const mobile = read('apps/mobile/src/index.css');
  assert.match(brand, /h-\[30px\] w-\[30px\]/);
  assert.match(mobile, /\.safebus-brand-mark img\s*\{[\s\S]*width: 78%;[\s\S]*height: 78%;/);
});
