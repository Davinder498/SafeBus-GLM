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
  assert.ok(billing.includes('final monthly and annual prices are **undecided**'));
});

test('contract drafts keep address private and prices tax-inclusive without inventing amounts', () => {
  const msa = read('docs/governance/phase-3/business-pack/master-services-agreement.md');
  const order = read('docs/governance/phase-3/business-pack/order-form.md');
  const pilot = read('docs/governance/phase-3/business-pack/pilot-contract-signoff-2026-11-07.md');
  assert.ok(msa.includes('**inclusive of'));
  assert.ok(order.includes('including applicable GST/HST'));
  assert.ok(order.includes('[PROVIDER_BUSINESS_ADDRESS]'));
  assert.ok(pilot.includes('private mailing address must not appear in Git'));
  assert.ok(pilot.includes('Insurance purchase deferred'));
});

test('tax update does not approve privacy, map, operations, or pilot readiness', () => {
  for (const path of ['docs/governance/privacy-readiness.json','docs/governance/map-readiness.json','docs/governance/operations-readiness.json']) {
    assert.equal(JSON.parse(read(path)).status, 'not_approved', path);
  }
  assert.equal(JSON.parse(read('docs/governance/pilot-authorization.json')).status, 'not_authorized');
});
