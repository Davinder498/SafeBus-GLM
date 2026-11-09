import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('new prices are tax-inclusive and existing prices are not modified by creation', () => {
  const source = read('apps/web/netlify/functions/platform-pricing.mjs');
  assert.match(source, /tax_behavior: 'inclusive'/);
  assert.match(source, /stripe\.prices\.create\(/);
  assert.ok(!source.includes("stripe.prices.update(input.id, { tax_behavior"));
  const testSource = read('apps/web/src/__tests__/platform-pricing.test.mjs');
  assert.ok(testSource.includes("toBe('inclusive')"));
  assert.ok(testSource.includes('stripe.prices.update).not.toHaveBeenCalled()'));
});

test('tenant and platform UI distinguish tax-inclusive from historical unspecified prices', () => {
  const service = read('apps/web/netlify/functions/tenant-subscriptions.mjs');
  const district = read('apps/web/src/pages/AdminSubscriptionPage.tsx');
  const platform = read('apps/web/src/pages/PlatformPricingPage.tsx');
  assert.match(service, /taxBehavior: p\.tax_behavior \?\? 'unspecified'/);
  assert.ok(district.includes("selected?.taxBehavior === 'inclusive'"));
  assert.ok(district.includes('tax treatment confirmed at checkout'));
  assert.ok(platform.includes('Tax behaviour not specified on this existing Stripe price'));
  assert.equal(JSON.parse(read('docs/governance/privacy-readiness.json')).status, 'not_approved');
});
