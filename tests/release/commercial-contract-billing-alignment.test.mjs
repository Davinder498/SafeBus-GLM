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
  const msa = (await read('master-services-agreement.md')).replace(/\\s+/g, ' ').replace(/\\*\\*/g, '');
  const order = await read('order-form.md');
  const owner = await read('owner-decisions.md');
  const pilot = await read('pilot-contract-signoff-2026-11-07.md');
  assert.match(msa, /greater of CA\\$25,000 or the 12-Month Fees/i);
  assert.match(msa, /greater of CA\\$100,000 or twice the 12-Month Fees/i);
  assert.match(msa, /limited, fault-based third-party indemnification/i);
  assert.match(msa, /Defence costs, settlements and damages all count toward/i);
  assert.match(msa, /No reciprocal Customer indemnity is silently imposed/i);
  assert.match(order, /limited, fault-based indemnification/i);
  assert.match(order, /defence costs, approved settlements and damages count inside/i);
  assert.match(owner, /Final limited third-party indemnification decision/i);
  assert.match(pilot, /owner-approved third-party indemnification scope/i);
  assert.match(msa, /No active CGL, technology E&O, cyber\\/privacy insurance/i);
});

test('initial-pilot SLA states owner-approved business hours, nine holidays and no unverified guarantees', async () => {
  const s = await read('service-level-agreement.md');
  assert.match(s, /Monday.Friday, 8:00 a\.m..5:00 p\.m\. Alberta local/i);
  assert.match(s, /America\/Edmonton/);
  assert.match(s, /nine general holidays/i);
  for (const name of ["New Year's Day", 'Alberta Family Day', 'Good Friday', 'Victoria Day', 'Canada Day', 'Labour Day', 'Thanksgiving Day', 'Remembrance Day', 'Christmas Day']) {
    assert.ok(s.includes(name), name);
  }
  assert.match(s, /not additional pilot closures/);
  assert.match(s, /no\s+contractual first-response time or after-hours human-response guarantee/i);
  assert.match(s, /no numerical service-level commitment/i);
  assert.match(s, /No automatic uptime-based service credits/i);
  assert.match(s, /both monthly and annual/i);
  assert.match(s, /DPA's separate/);
  assert.doesNotMatch(s, /\[MONTHLY_AVAILABILITY_PERCENT\]|\[P1_ACK\]|\[CREDIT_TIERS\]/);
});

test('SLA, MSA, Order Form and decision ledger preserve ordinary-hours vs urgent-incident separation', async () => {
  const sla = await read('service-level-agreement.md');
  const msa = await read('master-services-agreement.md');
  const order = await read('order-form.md');
  const owner = await read('owner-decisions.md');
  const operations = await fs.readFile('docs/operations/cr1-remaining-launch-work-2026-11-08.md','utf8');
  for (const [name,document] of Object.entries({sla,msa,order,owner,operations})) {
    assert.match(document,/America\/Edmonton/,name);
    assert.match(document,/nine\s+general\s+holidays/,name);
    assert.match(document,/no (?:guaranteed |contractual |automatic |24\/7 |staffed )/i,name);
  }
  assert.match(sla,/do not postpone or\s+override/i);
  assert.match(msa,/DPA's incident-notification duties/);
  assert.match(order,/independently verify DPA\/law urgent incident escalation/);
  assert.match(owner,/Open operational gate/);
});

test('support policy closes holiday business decision without approving customer contracts or incident staffing', async () => {
  const pilot = await read('pilot-contract-signoff-2026-11-07.md');
  const index = await read('README.md');
  const checklist = await fs.readFile('docs/governance/phase-3/contract-checklist.md', 'utf8');
  assert.match(pilot, /Business calendar CLOSED/);
  assert.match(pilot, /independent DPA\/security incident escalation still require evidence/);
  assert.match(index, /nine general\s+holidays/);
  assert.match(index, /eight-document\s+contract pack remains a \*\*draft and unpublished\*\*/);
  assert.match(checklist, /no numerical performance guarantees or automatic credits/);
  assert.match(checklist, /Customer execution\/operational evidence pending/);
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
