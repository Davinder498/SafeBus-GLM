import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('external guardian pickup and drop-off copy is fixed before detailed rendering', () => {
  const source = read('apps/web/netlify/functions/guardian-notification-email.mjs');
  assert.match(source, /student_picked_up:\s*Object\.freeze/);
  assert.match(source, /student_dropped_off:\s*Object\.freeze/);
  assert.ok(source.includes('SafeBus: Pickup recorded'));
  assert.ok(source.includes('SafeBus: Drop-off recorded'));
  assert.ok(source.includes('Sign in to SafeBus to view details.'));
  assert.ok(source.indexOf('if (generic)') < source.indexOf('let tz = DEFAULT_TZ'));
});

test('active guardian notices disclose generic external events and ongoing US processing', () => {
  const role = read('apps/web/src/components/privacy/RolePrivacyNotices.tsx');
  const page = read('apps/web/src/pages/PrivacyPolicyPage.tsx');
  const guardian = read('docs/governance/phase-3/notices/guardian-privacy-notice.md');
  assert.ok(role.includes('Enabled pickup/drop-off emails use generic'));
  assert.ok(page.includes('Pickup/drop-off email subjects and bodies use generic event text'));
  assert.ok(guardian.includes('Enabled pickup/drop-off emails use **generic event notices**'));
  for (const text of [role, page, guardian]) {
    assert.ok(text.includes('Resend'));
    assert.ok(text.includes('United States'));
  }
  assert.ok(!role.includes("your student's full name, the bus number, the recorded event and its time"));
  assert.ok(!page.includes("Pickup/drop-off emails may contain a student&apos;s full name"));
});

test('current draft commercial disclosure reflects PR 414 without asserting live delivery', () => {
  const expected = [
    ['docs/governance/phase-3/business-pack/README.md', 'guardian pickup/drop-off external email subject/body are now generic'],
    ['docs/governance/phase-3/business-pack/privacy-policy.md', 'Enabled pickup/drop-off emails use generic subject/body text'],
    ['docs/governance/phase-3/business-pack/supplier-disclosure.md', 'pickup/drop-off external subject/body uses **generic event text'],
    ['docs/governance/phase-3/business-pack/data-processing-agreement.md', 'verified published source now renders generic pickup/drop-off emails'],
    ['docs/governance/phase-3/business-pack/district-supplier-processing-appendix-review-2026-11-08.md', 'Published source now renders **generic pickup/drop-off email text**'],
    ['docs/governance/phase-3/privacy-impact-assessment.md', 'pickup/drop-off external email subject/body use generic event text'],
  ];
  for (const [path, phrase] of expected) assert.ok(read(path).includes(phrase), path);
  const historical = read('docs/governance/phase-3/business-pack/supplier-dpa-insurance-contract-review-2026-11-08.md');
  assert.ok(historical.includes('dated pre-remediation snapshot'));
  assert.ok(historical.includes('not live synthetic Resend delivery proof'));
});

test('supplier ledger distinguishes historical incidents from current published source', () => {
  const ledger = JSON.parse(read('docs/governance/phase-3/supplier-approval-ledger-2026-11-06.json'));
  const resend = ledger.suppliers.find((v) => v.id === 'resend');
  const fcm = ledger.suppliers.find((v) => v.id === 'fcm');
  assert.ok(resend);
  assert.ok(fcm);
  assert.match(ledger.statement, /CURRENT VERIFIED SOURCE/);
  assert.ok(resend.observedFacts.includes('pr_414_merged_generic_pickup_dropoff_subject_text_html_2026_11_08'));
  assert.ok(resend.observedFacts.includes('outbound_resend_http_json_mocked_test_only_no_live_delivery'));
  assert.ok(fcm.observedFacts.includes('historical_pre_2026_11_08_v7_push_forwarded_detailed_provider_copy'));
  assert.ok(resend.required.includes('authority_approves_remaining_us_hosted_recipient_event_delivery_metadata_and_other_email_content'));
  assert.equal(resend.status, 'account-evidence-pending');
  assert.equal(fcm.status, 'account-evidence-pending');
});
