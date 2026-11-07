import {beforeEach,describe,expect,it,vi} from 'vitest';

const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase',()=>({
  supabase:{rpc},supabaseConfigError:null
}));

import {
  getDistrictAgreement,getPlatformAgreement,acceptDistrictAgreement,
  getAgreementReceipt,listMyAgreementReceipts,
  listPlatformAgreementDocuments,publishAgreementCatalog,publishAgreementDocument
} from './districtAgreementService';

describe('SafeBus direct district MSA DPA acceptance',()=>{
  beforeEach(()=>rpc.mockReset());

  it('does not invent a signed or published document when the migration is absent',async()=>{
    rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}});
    await expect(getDistrictAgreement()).resolves.toMatchObject({status:'not_issued',documents:[]});
    await expect(getPlatformAgreement('district-1')).resolves.toMatchObject({status:'not_issued'});
    await expect(listMyAgreementReceipts()).resolves.toEqual([]);
  });
  it('fails closed on denied agreement read',async()=>{
    rpc.mockResolvedValue({data:null,error:{code:'42501',message:'denied'}});
    await expect(getDistrictAgreement()).rejects.toThrow('Unable to securely load');
    await expect(listMyAgreementReceipts()).rejects.toThrow('Unable to load contract archive');
  });
  it('returns exact approved version and full body text',async()=>{
    const doc={id:'a',kind:'dpa',title:'Data Processing Agreement',version:'2026-1',
      body:'Full contract body',sha256:'a'.repeat(64)};
    rpc.mockResolvedValue({data:{id:'package',status:'issued',tenant_name:'District A',
      bundle_sha256:'b'.repeat(64),documents:[doc]},error:null});
    const agreement=await getDistrictAgreement();
    expect(agreement.documents).toEqual([doc]);
    expect(agreement.status).toBe('issued');
    expect(agreement.bundle_sha256).toBe('b'.repeat(64));
  });
  it('passes three separate affirmative statements and the exact bundle digest',async()=>{
    rpc.mockResolvedValue({data:{status:'executed',receipt_id:'receipt-1'},error:null});
    const result=await acceptDistrictAgreement({
      id:'package-1',digest:'c'.repeat(64),name:'District Admin',
      title:'Transportation Director',electronicConsent:true,
      authorityAttested:true,signatureIntent:true
    });
    expect(result.status).toBe('executed');
    expect(rpc).toHaveBeenCalledWith('accept_my_district_agreement',expect.objectContaining({
      p_package_id:'package-1',p_bundle_sha256:'c'.repeat(64),
      p_electronic_consent:true,p_authority_attested:true,p_signature_intent:true,
    }));
  });
  it('retrieves archived snapshot only through the authenticated receipt endpoint',async()=>{
    const record={id:'receipt-1',signed_at:'2026-11-07T00:00:00Z',
      receipt_sha256:'a'.repeat(64),bundle_sha256:'b'.repeat(64),
      document_snapshot:{customer:'District A',provider:'SafeBus',documents:[]}};
    rpc.mockResolvedValue({data:record,error:null});
    await expect(getAgreementReceipt('receipt-1')).resolves.toMatchObject(record);
    expect(rpc).toHaveBeenCalledWith('get_my_district_agreement_receipt',{
      p_receipt_id:'receipt-1'
    });
  });
  it('publishes only through platform-scoped RPC calls',async()=>{
    rpc.mockResolvedValue({data:{published:true,revision:1},error:null});
    await publishAgreementCatalog(['one','two']);
    expect(rpc).toHaveBeenCalledWith('platform_publish_agreement_catalog',{
      p_document_ids:['one','two']
    });
    await publishAgreementDocument({kind:'dpa',title:'DPA',version:'1',body:'final'});
    expect(rpc).toHaveBeenCalledWith('platform_publish_agreement_document',{
      p_kind:'dpa',p_title:'DPA',p_version:'1',p_body:'final'
    });
    rpc.mockResolvedValue({data:[],error:null});
    await expect(listPlatformAgreementDocuments()).resolves.toEqual([]);
  });
});
