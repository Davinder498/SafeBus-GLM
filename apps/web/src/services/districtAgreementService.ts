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
}
export interface SignerPreview {
 state:'ready';signerName:string;signerTitle:string;tenantId:string;packageId:string;
 revision:number;bundleHash:string;documents:AgreementDocument[];expiresAt:string;
}
const failure='SafeBus could not confirm the agreement action. Refresh the status before retrying.';
export async function districtAgreementRequest<T extends Record<string,unknown>>(body:Record<string,unknown>):Promise<T> {
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
