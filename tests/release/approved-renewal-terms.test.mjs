import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { scheduledRenewalChange } from '../../apps/web/netlify/functions/billing-renewal-terms.mjs';

test('cancel and resume requests are period-end and never prorate paid terms', () => {
  for (const action of ['cancel', 'cancel_renewal']) {
    assert.deepEqual(scheduledRenewalChange(action),
      { cancel_at_period_end: true, proration_behavior: 'none' });
  }
  for (const action of ['keep', 'resume_renewal']) {
    assert.deepEqual(scheduledRenewalChange(action),
      { cancel_at_period_end: false, proration_behavior: 'none' });
  }
  assert.throws(() => scheduledRenewalChange('refund'), /billing_invalid_renewal_action/);
});

test('MSA and Order Form match approved monthly annual and refund rules', async () => {
  const files = [
    'docs/governance/phase-3/business-pack/master-services-agreement.md',
    'docs/governance/phase-3/business-pack/order-form.md',
  ];
  for (const path of files) {
    const s = await fs.readFile(path, 'utf8');
    assert.match(s, /month-to-month/i);
    assert.match(s, /12-month/i);
    assert.match(s, /renew(?:s|ed|ing)? automatically/i);
    assert.match(s, /no early cancellation fee/i);
    assert.match(s, /no partial refund/i);
    assert.match(s, /14-day/i);
  }
});

test('invoice/PO drafts require an individually approved payment window rather than blanket net 30', async () => {
  const msa = await fs.readFile('docs/governance/phase-3/business-pack/master-services-agreement.md', 'utf8');
  const order = await fs.readFile('docs/governance/phase-3/business-pack/order-form.md', 'utf8');
  assert.match(msa, /14, 30, 45 or 60 calendar days/);
  assert.match(order, /14, 30, 45 or 60 days after invoice issuance/);
  assert.match(msa, /Approval alone does not issue an invoice or start a subscription/);
});

test('card and invoice cancellation handlers do not issue immediate refunds', async () => {
  const files = [
    'apps/web/netlify/functions/tenant-subscriptions.mjs',
    'apps/web/netlify/functions/invoice-billing.mjs',
  ];
  for (const path of files) {
    const source = await fs.readFile(path, 'utf8');
    assert.match(source, /scheduledRenewalChange\(input\.action\)/);
    assert.doesNotMatch(source, /stripe\.refunds\.create\(/);
    assert.doesNotMatch(source, /stripe\.subscriptions\.cancel\(/);
  }
});
