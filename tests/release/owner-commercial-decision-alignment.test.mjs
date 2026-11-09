import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('latest owner decisions reflect GST effective date and tax-inclusive future prices', () => {
  const owner = read('docs/governance/phase-3/business-pack/owner-decisions.md');
  const billing = read('docs/governance/commercial-billing-contract-alignment-2026-11-07.md');
  assert.ok(owner.includes('GST/HST-registered effective 2026-11-08'));
  assert.ok(owner.includes('**GST/HST-inclusive prices**'));
  assert.ok(owner.includes('info@safebus.kids'));
  assert.ok(billing.includes('2026-10-23T14:19:38Z'));
  assert.ok(billing.includes('automatic_tax.enabled=true'));
  assert.ok(billing.includes('Owner-approved, final standard rates'));
  assert.ok(billing.includes('CA$1.99 per active bus/month'));
  assert.ok(billing.includes('CA$20.29 per active bus/year'));
});

test('contract drafts keep address private while recording the owner-approved fixed tariff', () => {
  const msa = read('docs/governance/phase-3/business-pack/master-services-agreement.md');
  const order = read('docs/governance/phase-3/business-pack/order-form.md');
  const pilot = read('docs/governance/phase-3/business-pack/pilot-contract-signoff-2026-11-07.md');
  assert.ok(msa.includes('**including applicable GST/HST**'));
  assert.ok(order.includes('including applicable GST/HST'));
  assert.ok(order.includes('CA$1.99 per active bus/month'));
  assert.ok(order.includes('CA$20.29 per active bus/year'));
  assert.ok(order.includes('[PROVIDER_BUSINESS_ADDRESS]'));
  assert.ok(pilot.includes('private mailing address must not appear in Git'));
  assert.ok(pilot.includes('Insurance purchase deferred'));
});

test('owner-approved proposed liability caps are not misrepresented as insured or executed', () => {
  const owner = read('docs/governance/phase-3/business-pack/owner-decisions.md');
  const msa = read('docs/governance/phase-3/business-pack/master-services-agreement.md');
  const normalizedOwner = owner.replace(/\s+/g, ' ').replace(/\*\*/g,'');
  const normalizedMsa = msa.replace(/\s+/g, ' ').replace(/\*\*/g,'');
  assert.ok(normalizedOwner.includes('greater of CA$25,000 or 12-Month'));
  assert.ok(normalizedOwner.includes('greater of CA$100,000 or twice 12-Month'));
  assert.match(normalizedOwner, /insurance quotations and purchase|insurance quotations are deferred|deferred quotations and purchase/i);
  assert.match(normalizedMsa, /No active CGL, technology E&O,/);
  assert.match(normalizedMsa, /accepted Customer-specific MSA and Order Form/);
});

test('tax update does not approve privacy, map, operations, or pilot readiness', () => {
  for (const path of ['docs/governance/privacy-readiness.json','docs/governance/map-readiness.json','docs/governance/operations-readiness.json']) {
    assert.equal(JSON.parse(read(path)).status, 'not_approved', path);
  }
  assert.equal(JSON.parse(read('docs/governance/pilot-authorization.json')).status, 'not_authorized');
});

test('owner-approved 14-day card trial and platform-approved invoice exception stay documented',()=>{
  const owner=read('docs/governance/phase-3/business-pack/owner-decisions.md');
  assert.ok(owner.includes('**one 14-day free trial per first-time school authority**'));
  assert.ok(owner.includes('**invoice/purchase-order alternative when a platform administrator authorizes it**'));
  assert.ok(owner.includes('monthly / CA$20.29 annual'));
  assert.ok(owner.includes('Approval alone does not create a subscription or invoice'));
});
