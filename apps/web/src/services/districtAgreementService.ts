import { supabase, supabaseConfigError } from '@/lib/supabase';

export type AgreementKind = 'msa'|'dpa'|'order'|'security'|'sla'|'acceptable_use'|'return'|'suppliers';
export interface AgreementDocument {kind:AgreementKind;title:string;version:string;body:string;}
export interface SignerRecord {
 id:string;name:string;title:string;email:string;
 status:'requested'|'verified'|'invited'|'signed'|'revoked'|'declined';
 authorityVerified:boolean;
}
export interface AgreementStatus {
 state:'awaiting_documents'|'issued'|'customer_signed'|'executed'|'active'|'superseded'|'withdrawn';
 tenantId:string;required:boolean;packageId?:string;revision?:number;bundleHash?:string;
 documents?:AgreementDocument[];signers?:SignerRecord[];
 customerSignedAt?:string|null;providerSignedAt?:string|null;activatedAt?:string|null;
 customerSignerName?:string|null;customerSignerTitle?:string|null;
 providerSignerName?:string|null;providerSignerTitle?:string|null;
}
export interface SignerPreview {
 state:'ready';signerName:string;signerTitle:string;tenantId:string;packageId:string;
 revision:number;bundleHash:string;documents:AgreementDocument[];expiresAt:string;
}
const failure='SafeBus could not confirm the agreement action. Refresh the status before retrying.';
export async function districtAgreementRequest<T extends object>(body:Record<string,unknown>):Promise<T> {
 let token:string|undefined;
 const signerAction=body.action==='signer_preview'||body.action==='signer_sign';
 if (!signerAction) {
   if (!supabase) throw new Error(supabaseConfigError ?? 'Unable to connect to SafeBus.');
   const {data,error}=await supabase.auth.getSession();
   token=data.session?.access_token;
   if (error || !token) throw new Error('Sign in to review school authority agreements.');
 }
 let response:Response;
 try {
   response=await fetch('/.netlify/functions/district-agreements',{
     method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
     body:JSON.stringify(body),
   });
 } catch {throw new Error(failure);}
 const isJson=response.headers.get('content-type')?.includes('application/json');
 const data:unknown=isJson?await response.json().catch(()=>null):null;
 if (!isJson || !data || typeof data!=='object' || Array.isArray(data)) throw new Error(failure);
 const result=data as Record<string,unknown>;
 if (!response.ok) throw new Error(typeof result.error==='string'?result.error:failure);
 if (typeof result.state!=='string') throw new Error(failure);
 return result as T;
}
export function getTenantAgreementStatus() {
 return districtAgreementRequest<AgreementStatus>({action:'status_tenant'});
}
export function getPlatformAgreementStatus(tenantId:string) {
 return districtAgreementRequest<AgreementStatus>({action:'status_platform',tenantId});
}
export function agreementIsReady(status:AgreementStatus) {
 return !status.required || status.state==='active';
}
export const agreementKinds:ReadonlyArray<{kind:AgreementKind;label:string}>=[
 {kind:'msa',label:'Master Services Agreement'},
 {kind:'dpa',label:'Data Processing Agreement'},
 {kind:'order',label:'Order Form'},
 {kind:'security',label:'Security Schedule'},
 {kind:'sla',label:'Service-Level Agreement'},
 {kind:'acceptable_use',label:'Acceptable Use'},
 {kind:'return',label:'Return & Destruction'},
 {kind:'suppliers',label:'Supplier Disclosure'},
];

/** A human-readable copy of the exact saved terms; not a PDF certificate or
 * independent validation of signing authority. Available only from a genuine
 * click on the authenticated agreement page or signer receipt screen. */
export function downloadAgreementCopy(details:{
  revision:number;bundleHash:string;documents:AgreementDocument[];
  status:string;customerSignerName?:string|null;customerSignerTitle?:string|null;
  providerSignerName?:string|null;providerSignerTitle?:string|null;
  customerSignedAt?:string|null;providerSignedAt?:string|null;
}) {
 const intro=[
  'SafeBus school authority agreement copy',
  'Document set: '+details.documents.length+' terms',
  'Package revision: '+details.revision,
  'Canonical SHA-256: '+details.bundleHash,
  'Recorded state: '+details.status,
  'District signer: '+(details.customerSignerName??'not recorded')+' / '+(details.customerSignerTitle??''),
  'District signed UTC: '+(details.customerSignedAt??'not signed'),
  'SafeBus signer: '+(details.providerSignerName??'not recorded')+' / '+(details.providerSignerTitle??''),
  'SafeBus signed UTC: '+(details.providerSignedAt??'not signed'),
  '',
  'This is a download of the stored text and recorded signature metadata. It is not an independently certified PDF or a substitute for verified signing authority.',
 ];
 const documents=details.documents.flatMap(d=>[
  '', '--- '+d.title+' ---','Version: '+d.version,'Kind: '+d.kind,'',d.body,
 ]);
 const blob=new Blob([[...intro,...documents].join('\n')],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 try {
  const element=document.createElement('a');
  element.href=url;
  element.download=`SafeBus-agreement-revision-${details.revision}.txt`;
  element.click();
 } finally {URL.revokeObjectURL(url);}
}
