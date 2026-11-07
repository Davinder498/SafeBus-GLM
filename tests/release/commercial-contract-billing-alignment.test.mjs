import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = 'docs/governance/phase-3/business-pack';
const read = async (file) => fs.readFile(`${root}/${file}`, 'utf8');

test('MSA distinguishes monthly/annual licensing from service term and preserves draft approval', async () => {
  const s = await read('master-services-agreement.md');
  assert.match(s, /monthly or annual/i);
  assert.match(s, /per-active-bus/i);
  assert.match(s, /billing interval is separate from the service term/i);
  assert.match(s, /14-day trial/);
  assert.match(s, /not an authorized/i);
  assert.match(s, /send_invoice/);
  assert.match(s, /charge_automatically/);
  assert.match(s, /not executed/i);
  assert.doesNotMatch(s, /The proposed model is an annual per-bus subscription/);
});

test('customer order form requires approved interval, trial, first charge and collection mode', async () => {
  const s = await read('order-form.md');
  for (const placeholder of [
    '[BILLING_INTERVAL_MONTH_OR_YEAR]', '[PRICE_PER_BUS_CAD]',
    '[TRIAL_ELIGIBILITY_DAYS_END]', '[FIRST_CHARGE_DATE]',
    '[CHARGE_AUTOMATICALLY_OR_SEND_INVOICE]', '[APPLICABLE_TAXES]',
  ]) assert.ok(s.includes(placeholder), placeholder);
  assert.match(s, /not a purchase authorization/i);
  assert.doesNotMatch(s, /\[ANNUAL_PER_BUS_CAD\]/);
});

test('owner decisions require actual tax registration and keep price/coverage open', async () => {
  const s = await read('owner-decisions.md');
  assert.match(s, /Stripe Tax currently shows active settings/);
  assert.match(s, /not CRA registration evidence/);
  assert.match(s, /CRA legal registration/);
  assert.match(s, /14-day trial default/);
  assert.match(s, /approve each commercial price/i);
  assert.match(s, /Insurance/);
  assert.match(s, /\[GENERAL_LIABILITY_CAP\]/);
});

test('SLA treats monthly and annual credits consistently and keeps limits unsigned', async () => {
  const s = await read('service-level-agreement.md');
  assert.match(s, /both monthly and annual/i);
  assert.match(s, /\[MONTHLY_AVAILABILITY_PERCENT\]/);
  assert.match(s, /\[CREDIT_TIERS\]/);
  assert.match(s, /numerical commitments and remedies unapproved/i);
});

test('review record does not infer commercial launch authorization from Stripe live catalog', async () => {
  const s = await fs.readFile('docs/governance/commercial-billing-contract-alignment-2026-11-07.md', 'utf8');
  assert.match(s, /1\.99/);
  assert.match(s, /20\.29/);
  assert.match(s, /14-day trial/i);
  assert.match(s, /not.*CRA registration/i);
  assert.match(s, /not_approved/);
  assert.match(s, /No launch authorization/i);
});
