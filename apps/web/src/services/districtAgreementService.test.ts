import {beforeEach,describe,expect,it,vi} from 'vitest';

const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase',()=>({
  supabase:{rpc},supabaseConfigError:null
}));

import {
  getDistrictAgreement,getPlatformAgreement,acceptDistrictAgreement,
  getAgreementReceipt,listMyAgreementReceipts,serializeExecutedAgreementArchive,
  listPlatformAgreementDocuments,publishAgreementCatalog,publishAgreementDocument
} from './districtAgreementService';

describe('SafeBus direct district MSA DPA acceptance',()=>{
  beforeEach(()=>rpc.mockReset());

  it('does not conceal an unavailable database migration as an unpublished agreement',async()=>{
    rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}});
    await expect(getDistrictAgreement()).rejects.toThrow('not deployed');
    await expect(getPlatformAgreement('district-1')).rejects.toThrow('not deployed');
    await expect(listMyAgreementReceipts()).rejects.toThrow('not deployed');
  });
  it('returns a genuine not-issued state when the installed RPC reports no published catalog',async()=>{
    rpc.mockResolvedValue({data:{status:'not_issued',tenant_name:'District A',documents:[]},error:null});
    await expect(getDistrictAgreement()).resolves.toMatchObject({status:'not_issued',documents:[]});
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

describe('immutable UTF-8 executed agreement archive',()=>{
  const kinds=['msa','dpa','order_form','security','sla','acceptable_use','data_return','suppliers'];
  const archiveReceipt=()=>({
    id:'00000000-0000-4000-8000-000000000021',
    signed_at:'2026-11-09T00:00:00Z',
    bundle_sha256:'b'.repeat(64),
    receipt_sha256:'c'.repeat(64),
    document_snapshot:{
      customer:'École de la Rivière — ਸੇਫ਼ ਬੱਸ',
      provider:'Sachman Gold Inc. (SafeBus)',
      package_id:'00000000-0000-4000-8000-000000000020',
      revision:1,
      accepted_at:'2026-11-09T00:00:00Z',
      signer:{user_id:'synthetic-user',email:'test@example.invalid',name:'Élodie',title:'Transportation Director'},
      documents:kinds.map((kind,i)=>({
        id:String(i),kind,title:kind,version:'2026.1',
        sha256:'a'.repeat(64),
        body:`Contract text ${kind}: élève — ਪੰਜਾਬੀ ✓\nKeep punctuation, accents and blank lines.\n`
      }))
    }
  });

  it('preserves exact original Unicode agreement strings in a printable machine-readable archive',()=>{
    const receipt=archiveReceipt();
    const serialized=serializeExecutedAgreementArchive(receipt);
    const parsed=JSON.parse(serialized);
    expect(parsed.format).toBe('safebus-executed-agreement-utf8-v1');
    expect(parsed.document_snapshot.customer).toBe(receipt.document_snapshot.customer);
    expect(parsed.document_snapshot.documents).toEqual(receipt.document_snapshot.documents);
    expect(parsed.receipt_sha256).toBe(receipt.receipt_sha256);
    expect(serialized).toContain('ਪੰਜਾਬੀ');
    expect(serialized).toContain('Élodie');
  });
  it('refuses missing, duplicated or modified document inventory rather than exporting an incomplete record',()=>{
    const receipt=archiveReceipt();
    receipt.document_snapshot.documents[1].kind='msa';
    expect(()=>serializeExecutedAgreementArchive(receipt)).toThrow('incomplete');
    const fewer=archiveReceipt();
    fewer.document_snapshot.documents.pop();
    expect(()=>serializeExecutedAgreementArchive(fewer)).toThrow('incomplete');
    const missingBody=archiveReceipt();
    missingBody.document_snapshot.documents[0].body=' ';
    expect(()=>serializeExecutedAgreementArchive(missingBody)).toThrow('incomplete');
  });
});
