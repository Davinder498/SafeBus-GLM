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
  assert.match(s, /not be treated as a free pilot/i);
  assert.match(s, /send_invoice/);
  assert.match(s, /charge_automatically/);
  assert.match(s, /not executed/i);
  assert.doesNotMatch(s, /The proposed model is an annual per-bus subscription/);
});

test('customer order form requires approved interval, trial, first charge and collection mode', async () => {
  const s = await read('order-form.md');
  for (const placeholder of [
    '[BILLING_INTERVAL_MONTH_OR_YEAR]',
    '[TRIAL_ELIGIBILITY_DAYS_END]', '[FIRST_CHARGE_DATE]',
    '[CHARGE_AUTOMATICALLY_OR_SEND_INVOICE]', '[APPLICABLE_TAXES]',
  ]) assert.ok(s.includes(placeholder), placeholder);
  assert.match(s, /not a purchase authorization/i);
  assert.match(s, /CA\$1\.99 per active bus\/month/);
  assert.match(s, /CA\$20\.29 per active bus\/year/);
  assert.doesNotMatch(s, /\[ANNUAL_PER_BUS_CAD\]/);
});

test('owner decisions record approved trial, recurring contract and tax registration evidence without authorizing launch', async () => {
  const s = await read('owner-decisions.md');
  // The November 8 statement supersedes the historical November 7 declaration.
  // This is not a CRA-account audit or approval to change Stripe tax collection.
  assert.match(s, /GST\/HST-registered effective 2026-11-08/);
  assert.match(s, /CRA confirmation and account identifiers must be stored privately/i);
  assert.match(s, /2026-10-23T14:19:38Z/);
  assert.match(s, /\*\*one 14-day free trial per first-time school authority\*\*/);
  assert.match(s, /month-to-month automatic monthly renewal/);
  assert.match(s, /12-month automatic annual renewal/);
  assert.match(s, /no early cancellation fee/i);
  assert.match(s, /no partial refund/i);
  assert.match(s, /approved CA\$1\.99 per active bus per month/);
  assert.match(s, /CA\$20\.29 per active bus per year/);
  assert.match(s, /tax_behavior=inclusive/);
  assert.match(s, /\*\*GST\/HST-inclusive prices\*\*/);
  assert.match(s, /Insurance/);
  const liabilityText = s.replace(/\s+/g,' ').replace(/\*\*/g,'');
  assert.match(liabilityText, /CA\$25,000 or 12-Month Fees/);
  assert.match(liabilityText, /CA\$100,000 or twice 12-Month Fees/);
  assert.doesNotMatch(s, /\[GENERAL_LIABILITY_CAP\]|\[PRIVACY_LIABILITY_CAP\]/);
});

test('initial-pilot MSA, Order Form and DPA retain insured-risk and statutory carve-outs', async () => {
  const msa = await read('master-services-agreement.md');
  const order = await read('order-form.md');
  const dpa = await read('data-processing-agreement.md');
  for (const document of [msa,order]) {
    assert.match(document, /CA\$25,000/);
    assert.match(document, /CA\$100,000/);
    assert.match(document, /12-Month Fees/);
    assert.match(document, /insurance/i);
  }
  assert.match(msa, /privacy\/security cap[\s\S]*?replaces/);
  assert.match(msa, /non-excludable|does not permit the parties/);
  assert.match(msa, /no partial refund|no-partial-refund/i);
  assert.match(dpa, /separate from and do not eliminate or postpone any non-excludable/);
  assert.match(order, /Insurance quotation and purchase deferred/);
});

test('approved limited indemnification appears in the MSA, Order Form and decisions without removing liability limits', async () => {
  const msa = (await read('master-services-agreement.md')).replace(/\s+/g, ' ').replace(/\*\*/g, '');
  const order = await read('order-form.md');
  const owner = await read('owner-decisions.md');
  const pilot = await read('pilot-contract-signoff-2026-11-07.md');
  assert.match(msa, /greater of CA\$25,000 or the 12-Month Fees/i);
  assert.match(msa, /greater of CA\$100,000 or twice the 12-Month Fees/i);
  assert.match(msa, /limited, fault-based third-party indemnification/i);
  assert.match(msa, /Defence costs, settlements and damages all count toward/i);
  assert.match(msa, /No reciprocal Customer indemnity is silently imposed/i);
  assert.match(order, /limited, fault-based indemnification/i);
  assert.match(order, /defence costs, approved settlements and damages count inside/i);
  assert.match(owner, /Final limited third-party indemnification decision/i);
  assert.match(pilot, /owner-approved third-party indemnification scope/i);
  assert.match(msa, /No active CGL, technology E&O, cyber\/privacy insurance/i);
});

test('all customer contracts use the approved single support window including critical incidents', async () => {
  for(const file of ['service-level-agreement.md','master-services-agreement.md','order-form.md','data-processing-agreement.md']){
    const s=await read(file);
    assert.match(s,/Monday–Saturday, 6:00 a\.m\.–6:00 p\.m\. Alberta local time \(America\/Edmonton\)/,file);
    assert.match(s,/critical/i,file);
    assert.match(s,/no (?:separate )?holiday exclusion/i,file);
    assert.doesNotMatch(s,/provides 24\/7 urgent|receive 24\/7 coverage|coverage 24 hours|incidents have \*\*24\/7/i,file);
    assert.doesNotMatch(s,/Monday.Friday, 8:00|excluding Alberta's nine general holidays/i,file);
  }
  const sla=await read('service-level-agreement.md');
  assert.match(sla,/no numerical service-level commitment/i);
  assert.match(sla,/No automatic uptime-based service credits/i);
  assert.match(sla,/both monthly and annual/i);
  assert.match(sla,/do not postpone or\s+override/);
  assert.match(sla,/DPA's separate immediate incident notice/);
  for(const file of ['owner-decisions.md','README.md','pilot-contract-signoff-2026-11-07.md'])
    assert.match(await read(file),/Current owner instruction[\s\S]*supersedes earlier support decisions/);
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

test('owner-approved trial policy is reflected in subscription contracts and operating docs', async () => {
  const msa = await read('master-services-agreement.md');
  const order = await read('order-form.md');
  const runbook = await fs.readFile('docs/operations/stripe-subscription-release.md','utf8');
  for (const value of ['14-day','invoice','purchase']) {
    assert.ok((msa+'\n'+order+'\n'+runbook).toLowerCase().includes(value), value);
  }
  assert.match(order,/CA\$1\.99/);
  assert.match(order,/CA\$20\.29/);
  assert.match(runbook,/payment_method_collection=always/);
  assert.match(runbook,/missing_payment_method=create_invoice/);
  assert.match(runbook,/platform-super-admin/i);
  assert.match(runbook,/send_invoice/);
});


test('limited staffing never permits delaying a known breach notice until reopening', async () => {
  const dpa=await read('data-processing-agreement.md');
  assert.match(dpa,/On actual awareness[\s\S]*immediately notifies/);
  assert.match(dpa,/Do not wait for the next staffed opening/);
  assert.match(dpa,/does not suspend[\s\S]*legal notification/);
});
