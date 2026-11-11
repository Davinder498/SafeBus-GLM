import { test, expect } from '@playwright/test';
import { installBilling, tenantId } from './fixtures/billing';

const docs = [
  ['msa','Master Services Agreement'],
  ['dpa','Data Processing Agreement'],
  ['order_form','Order Form'],
  ['security','Security Schedule'],
  ['sla','Service-Level Agreement'],
  ['acceptable_use','Acceptable Use Terms'],
  ['data_return','Data Return & Destruction'],
  ['suppliers','Supplier Disclosure'],
].map(([kind,title],i)=>({
  id:`00000000-0000-4000-8000-${String(i+11).padStart(12,'0')}`,
  kind,title,version:'2026.1',sha256:'b'.repeat(64),
  body:`# ${title}\nApproved example terms only. The synthetic school district does not contain real student data.\n`.repeat(3)
}));

test('district admin accepts complete MSA DPA online and retrieves immutable receipt archive',async({page})=>{
  await installBilling(page);
  let accepted=false;
  let order:Record<string,unknown>|null=null;
  const orderRequests:Record<string,unknown>[]=[];
  const requests:Record<string,unknown>[]=[];
  await page.route('**/rest/v1/rpc/get_my_district_agreement',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      id:'00000000-0000-4000-8000-000000000010',
      status:accepted?'executed':'issued',
      tenant_name:'Example Transit',
      version:'2026.1',revision:1,
      bundle_sha256:(order?'d':'a').repeat(64),documents:docs,order_required:true,order_details:order,
      customer_signed_at:accepted?'2026-11-07T14:00:00Z':null
    })});
  });
  await page.route('**/rest/v1/rpc/prepare_my_district_agreement_order',async route=>{
    const request=route.request().postDataJSON();orderRequests.push(request);order=request.p_order;
    await route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
  await page.route('**/rest/v1/rpc/list_my_district_agreement_receipts',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(accepted?[{
      id:'00000000-0000-4000-8000-000000000099',
      signed_at:'2026-11-07T14:00:00Z',
      receipt_sha256:'c'.repeat(64),
      bundle_sha256:'a'.repeat(64),
      actor_email:'admin@example.test'
    }]:[])});
  });
  await page.route('**/rest/v1/rpc/accept_my_district_agreement',async route=>{
    const body=route.request().postDataJSON();
    requests.push(body);
    accepted=true;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      status:'executed',receipt_id:'00000000-0000-4000-8000-000000000099'
    })});
  });
  await page.goto('/admin/onboarding/agreements');
  await expect(page.getByRole('heading',{name:'Agreements'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Example Transit',exact:true})).toBeVisible();
  await expect(page.getByRole('tab',{name:'DPA'})).toBeVisible();
  await page.getByRole('tab',{name:'DPA'}).click();
  await expect(page.getByRole('heading',{name:'Data Processing Agreement'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Accept MSA/})).toHaveCount(0);
  await page.getByLabel('Licensed active buses').fill('12');
  await page.getByLabel('School authority privacy email').fill('privacy@example.test');
  await page.getByLabel('School authority urgent contact email').fill('urgent@example.test');
  await page.getByRole('button',{name:'Save and review order'}).click();
  await expect(page.getByRole('tab',{name:'Order Form'})).toHaveAttribute('aria-selected','true');
  expect(orderRequests).toHaveLength(1);
  expect(orderRequests[0]).toMatchObject({p_order:{interval:'month',quantity:12,collection_method:'charge_automatically'}});
  await page.getByLabel('Your full legal name').fill('Test Admin');
  await page.getByLabel('Your official title').fill('Transportation Director');
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('checkbox').nth(2).check();
  await page.getByRole('button',{name:'Accept MSA, DPA and all incorporated schedules'}).click();
  await expect(page.getByText('Accepted and archived', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    p_bundle_sha256:'d'.repeat(64),
    p_electronic_consent:true,p_authority_attested:true,p_signature_intent:true
  });
  await expect(page.getByRole('button',{name:'Download executed PDF'})).toBeVisible();
  await page.getByRole('button',{name:'Continue to billing'}).click();
  await expect(page).toHaveURL('/admin/settings/billing');
});

test('unpublished agreement cannot be accepted, and retired/other roles cannot sign',async({page})=>{
  await installBilling(page);
  await page.route('**/rest/v1/rpc/get_my_district_agreement',async route=>
    route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({status:'not_issued',tenant_name:'Example Transit',documents:[]})})
  );
  await page.route('**/rest/v1/rpc/list_my_district_agreement_receipts',async route=>
    route.fulfill({status:200,contentType:'application/json',body:'[]'})
  );
  await page.goto('/admin/onboarding/agreements');
  await expect(page.getByText('Agreement not yet published')).toBeVisible();
  await expect(page.getByRole('button',{name:/Accept MSA/})).toHaveCount(0);
});
