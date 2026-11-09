import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const read = async (path) =>
  fs.readFile(new URL('../../' + path, import.meta.url), 'utf8');
const normalized = (text) => text.replace(/\s+/g, ' ').replace(/\*\*/g, '');

test('owner-approved Provider cap formulas, 12-month fee base and aggregate treatment are explicit in the MSA', async () => {
  const msa = normalized(await read('docs/governance/phase-3/business-pack/master-services-agreement.md'));
  assert.match(msa, /general claims: the greater of CA\$25,000 or the 12-Month Fees/i);
  assert.match(msa, /privacy\/security claims: the greater of CA\$100,000 or twice the 12-Month Fees/i);
  assert.match(msa, /subscription service fees paid or contractually payable by this Customer/i);
  assert.match(msa, /12 months immediately preceding the earliest event giving rise to the claim/i);
  assert.match(msa, /net of approved discounts and excluding GST\/HST and other taxes/i);
  assert.match(msa, /Allocate prepaid annual charges to the covered service months/i);
  assert.match(msa, /contract in force for less than 12 months/i);
  assert.match(msa, /do not reset for each incident, claim, invoice, year or renewal/i);
  assert.match(msa, /privacy\/security cap replaces, rather than adds to, the general cap/i);
  assert.match(msa, /does not allow stacking the two caps or duplicate recovery/i);
  assert.doesNotMatch(msa, /\[GENERAL_LIABILITY_CAP\]|\[PRIVACY_LIABILITY_CAP\]/);
});

test('minimum floors and the twice-fees rule hold for new, small and larger contracts', () => {
  const caps = (fees) => ({
    general: Math.max(25_000, fees),
    privacySecurity: Math.max(100_000, 2 * fees),
  });
  assert.deepEqual(caps(0), { general: 25_000, privacySecurity: 100_000 });
  assert.deepEqual(caps(2_000), { general: 25_000, privacySecurity: 100_000 });
  assert.deepEqual(caps(60_000), { general: 60_000, privacySecurity: 120_000 });
  assert.deepEqual(caps(120_000), { general: 120_000, privacySecurity: 240_000 });
});

test('fraud, non-excludable liability, breach remedies and DPA duties survive financial limits', async () => {
  const msa = normalized(await read('docs/governance/phase-3/business-pack/master-services-agreement.md'));
  const dpa = normalized(await read('docs/governance/phase-3/business-pack/data-processing-agreement.md'));
  assert.match(msa, /fraud, intentional or wilful misconduct/i);
  assert.match(msa, /liability that applicable law does not permit the parties to exclude or limit/i);
  assert.match(msa, /incident containment, notice, cooperation, lawful regulatory responses, data return, deletion/i);
  assert.match(msa, /convenience cancellation only/i);
  assert.match(msa, /does not waive statutory refunds or relief, remedies for material breach/i);
  assert.match(dpa, /do not eliminate or postpone any non-excludable privacy\/security duty/i);
  assert.match(msa, /No intellectual-property infringement, personal injury\/property damage/i);
  assert.match(msa, /no separate reciprocal Customer liability cap is selected/ii);
});

test('MSA, Order Form and governance decisions agree without claiming insurance or contract execution', async () => {
  const paths = [
    'docs/governance/phase-3/business-pack/master-services-agreement.md',
    'docs/governance/phase-3/business-pack/order-form.md',
    'docs/governance/phase-3/business-pack/owner-decisions.md',
    'docs/governance/phase-3/business-pack/pilot-contract-signoff-2026-11-07.md',
    'docs/governance/phase-3/business-pack/README.md',
    'docs/governance/phase-3/contract-checklist.md',
    'docs/operations/cr1-remaining-launch-work-2026-11-08.md',
    'docs/governance/commercial-billing-contract-alignment-2026-11-07.md',
    'docs/governance/phase-3/business-pack/digital-agreement-implementation-2026-11-07.md',
    'docs/governance/phase-3/business-pack/supplier-dpa-insurance-contract-review-2026-11-08.md',
    'docs/governance/privacy-supplier-launch-review-2026-11-06.md',
  ];
  for (const path of paths) {
    const document = normalized(await read(path));
    assert.match(document, /CA\$25,000/, path);
    assert.match(document, /CA\$100,000/, path);
    assert.match(document, /12-Month Fees/, path);
  }
  const msa = normalized(await read(paths[0]));
  const order = normalized(await read(paths[1]));
  const owner = normalized(await read(paths[2]));
  const pilot = normalized(await read(paths[3]));
  assert.match(msa, /deferred insurance quotations/);
  assert.match(msa, /No active CGL, technology E&O, cyber\/privacy policy/);
  assert.match(order, /Insurance quotation and purchase deferred by owner/);
  assert.match(owner, /deferred quotations and purchase/i);
  assert.match(pilot, /Insurance quotations and purchase deferred/);
  assert.match(msa, /not executed/i);
  assert.match(order, /not a purchase authorization or signature record/i);
  assert.match(owner, /not a signed district contract/i);
});
