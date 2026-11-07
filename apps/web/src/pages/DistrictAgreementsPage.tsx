import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Building2, CheckCircle2, FilePenLine, ShieldCheck, ArrowLeft } from 'lucide-react';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/useAuth';
import {
  agreementKinds, districtAgreementRequest, getTenantAgreementStatus,
  getPlatformAgreementStatus, agreementIsReady,
  type AgreementStatus, type AgreementKind, type AgreementDocument,
} from '@/services/districtAgreementService';

const recordPattern=/^[A-Za-z0-9][A-Za-z0-9._/-]{5,95}$/;
const slugLabel:Record<AgreementStatus['state'],string>={
 awaiting_documents:'Awaiting final documents',issued:'Ready for authorized signing',
 customer_signed:'Customer signed — SafeBus countersignature pending',
 executed:'Both parties signed — final activation pending',active:'Active',
 superseded:'Superseded',withdrawn:'Withdrawn',
};

export function DistrictAgreementsPage() {
 const { profile }=useAuth();
 const params=useParams<{tenantId:string}>();
 const navigate=useNavigate();
 const platform=profile?.role==='platform_super_admin';
 const tenantId=platform?params.tenantId:undefined;
 const [status,setStatus]=useState<AgreementStatus|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [success,setSuccess]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [tab,setTab]=useState<AgreementKind>('msa');
 const [name,setName]=useState('');
 const [title,setTitle]=useState('');
 const [email,setEmail]=useState('');
 const [authorityRef,setAuthorityRef]=useState('');
 const [approvalRef,setApprovalRef]=useState('');
 const [drafts,setDrafts]=useState<AgreementDocument[]>(agreementKinds.map(d=>({
   kind:d.kind,title:d.label,version:'',body:'',
 })));
 const [providerName,setProviderName]=useState('');
 const [providerTitle,setProviderTitle]=useState('');
 const [providerRef,setProviderRef]=useState('');
 const [providerConsent,setProviderConsent]=useState(false);
 const [activationRefs,setActivationRefs]=useState<Record<string,string>>({
  privacy:'',operations:'',pilot:'',supplier:'',security:'',
 });

 async function refresh() {
   try {
     const next=platform
       ? await getPlatformAgreementStatus(tenantId ?? '')
       : await getTenantAgreementStatus();
     setStatus(next);
     setError(null);
   } catch (err) {
     setError(err instanceof Error?err.message:'Could not load agreement status.');
   } finally {setLoading(false);}
 }
 useEffect(()=>{setLoading(true);void refresh();},[platform,tenantId]);

 async function act(body:Record<string,unknown>,message:string) {
   setBusy(true);setError(null);setSuccess(null);
   try {
     await districtAgreementRequest(body);
     setSuccess(message);
     await refresh();
   } catch (err) {setError(err instanceof Error?err.message:'Agreement change could not be confirmed.');}
   finally {setBusy(false);}
 }
 const issued=Boolean(status?.documents?.length===8);
 const documents=status?.documents??[];
 const displayed=documents.find(d=>d.kind===tab);
 const editable=drafts.find(d=>d.kind===tab);
 const canIssue=platform&&status?.required&&!['customer_signed','executed','active'].includes(status.state);
 const allDraftsValid=drafts.length===8&&drafts.every(d=>d.version.trim()&&d.body.trim().length>=200);
 const modifyDraft=(field:'version'|'body',value:string)=>{
   setDrafts(prev=>prev.map(d=>d.kind===tab?{...d,[field]:value}:d));
 };
 const requestSigner=(e:FormEvent)=>{
   e.preventDefault();
   void act({action:'request_signer',signerName:name.trim(),signerTitle:title.trim(),signerEmail:email.trim()},
     'Signing officer request saved. SafeBus must verify authority before sending a restricted signing invitation.');
 };
 const issue=(e:FormEvent)=>{
   e.preventDefault();
   void act({action:'issue',tenantId,documents:drafts,businessApprovalRef:approvalRef.trim()},
    'Versioned agreement package issued. An authorized officer must now be verified and invited.');
 };
 return (
  <DashboardLayout title="District agreements" portal="admin" navItems={[]} navGroups={adminNavGroups}>
   <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" onClick={()=>navigate(platform?'/admin/tenants':'/admin/settings')}>
        <ArrowLeft className="h-4 w-4"/> Back
      </Button>
    </div>
    <PageHeader eyebrow="School authority onboarding" title="Agreements & authorization"
      icon={<FilePenLine className="h-6 w-6"/>}
      description="Review SafeBus's versioned service and data-processing agreements. Signing is separate from account setup and transportation access."/>
    {loading&&<Card className="p-5"><p role="status">Checking agreement status…</p></Card>}
    {error&&<Card className="p-5"><p className="font-semibold text-[var(--color-danger-text)]" role="alert">{error}</p><Button variant="secondary" className="mt-3" onClick={()=>void refresh()}>Refresh</Button></Card>}
    {success&&<Card className="p-5"><p role="status" className="text-[var(--color-success-text)]">{success}</p></Card>}
    {status&&<>
      <Card className="p-5">
       <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
         <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-action)]"><ShieldCheck className="h-5 w-5"/></div>
         <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Contract status</p>
         <h2 className="mt-1 text-lg font-semibold text-[var(--color-text)]">
           {status.required?slugLabel[status.state]:'Existing authority — agreement gate not retroactively required'}
         </h2>
         <p className="mt-1 text-sm text-[var(--color-text-muted)]">
           {status.revision? `Revision ${status.revision}`:'No final agreement package has been issued'}
           {status.bundleHash?` · SHA-256 ${status.bundleHash.slice(0,12)}…`:''}
         </p>
         </div>
        </div>
        <Button variant="secondary" onClick={()=>void refresh()} disabled={busy}>Refresh status</Button>
       </div>
       {status.required&&!agreementIsReady(status)&&
         <p className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 text-sm text-[var(--color-text-muted)]">
           District operations remain unavailable until the contract package is executed and the authorized launch approvals are recorded. Account authentication does not grant contractual authority.
         </p>}
      </Card>
      {issued&&
       <Card className="overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
         <h2 className="text-lg font-semibold">Review agreement documents</h2>
         <p className="mt-1 text-sm text-[var(--color-text-muted)]">The documents below are the exact text recorded with this package; opening them does not mean acceptance.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto border-b border-[var(--color-border)] p-3" role="tablist" aria-label="Agreement documents">
          {agreementKinds.map(({kind,label})=>
            <button key={kind} id={`agreement-tab-${kind}`} type="button" role="tab"
              aria-selected={tab===kind} aria-controls="district-agreement-text"
              onClick={()=>setTab(kind)}
              className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${tab===kind?'bg-[var(--color-selection)] text-[var(--color-action)]':'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)]'}`}>
              {label}
            </button>)}
        </div>
        <div id="district-agreement-text" role="tabpanel" aria-labelledby={`agreement-tab-${tab}`} className="px-4 py-5 sm:px-6">
         <h3 className="text-lg font-bold">{displayed?.title}</h3>
         <p className="mt-1 text-xs text-[var(--color-text-muted)]">Document version {displayed?.version}</p>
         <pre className="mt-5 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[var(--color-text)]">{displayed?.body}</pre>
        </div>
       </Card>}
      {platform&&canIssue&&
       <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Issue finalized agreement package</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          Only issue the actual approved negotiated documents. Drafts, placeholders and unverifiable commercial terms are not ready for electronic signature. This does not approve commercial launch.
        </p>
        <form onSubmit={issue} className="mt-5 space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Upload text for document versions">
           {agreementKinds.map(d=><Button type="button" key={d.kind} variant={tab===d.kind?'primary':'outline'}
              size="sm" onClick={()=>setTab(d.kind)}>{d.label}</Button>)}
          </div>
          <Field label={`Version — ${editable?.title}`} htmlFor="document-version" required>
           <Input id="document-version" value={editable?.version??''} onChange={e=>modifyDraft('version',e.target.value)}
             placeholder="Approved document version"/>
          </Field>
          <Field label="Full approved document text" htmlFor="document-text" required
            hint="Paste the complete approved document; do not use excerpts. Every document must be finalized before issuing.">
           <textarea id="document-text" className="min-h-60 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm leading-6"
            value={editable?.body??''} onChange={e=>modifyDraft('body',e.target.value)}/>
          </Field>
          <Field label="Private business-approval evidence reference" htmlFor="business-approval" required>
           <Input id="business-approval" value={approvalRef} onChange={e=>setApprovalRef(e.target.value)} placeholder="Approved reference (no personal data)"/>
          </Field>
          <Button type="submit" disabled={busy||!allDraftsValid||!recordPattern.test(approvalRef)}>Issue finalized package</Button>
        </form>
       </Card>}
      {!platform&&status.state==='issued'&&
       <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Request an authorized district signer</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          The school authority administrator is not automatically authorized to sign. Identify a procurement or district officer. SafeBus will verify their authority and send a restricted signing link.
        </p>
        <form onSubmit={requestSigner} className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Signer's full legal name" htmlFor="signer-name" required><Input id="signer-name" value={name} onChange={e=>setName(e.target.value)} required/></Field>
          <Field label="Official title" htmlFor="signer-title" required><Input id="signer-title" value={title} onChange={e=>setTitle(e.target.value)} required/></Field>
          <div className="sm:col-span-2">
            <Field label="District work email" htmlFor="signer-email" required><Input id="signer-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></Field>
          </div>
          <div className="sm:col-span-2">
           <Button type="submit" disabled={busy||name.trim().length<2||title.trim().length<2||!email.includes('@')}>Request signing authority verification</Button>
          </div>
        </form>
       </Card>}
      {status.signers&&status.signers.length>0&&
       <Card className="p-5">
         <h2 className="text-lg font-semibold">Signing requests</h2>
         <div className="mt-4 space-y-3">{status.signers.map(s=>
           <div key={s.id} className="flex flex-col justify-between gap-3 rounded-xl border border-[var(--color-border)] p-4 sm:flex-row sm:items-center">
             <div className="min-w-0"><p className="font-semibold">{s.name} · {s.title}</p><p className="break-all text-sm text-[var(--color-text-muted)]">{s.email}</p><p className="text-xs text-[var(--color-text-muted)]">Status: {s.status}</p></div>
             {platform&&s.status==='requested'&&<Button variant="secondary" disabled={busy||!recordPattern.test(authorityRef)}
               onClick={()=>void act({action:'verify',signerId:s.id,authorityRef},
                'Signing authority evidence recorded. You may now send the signing link.')}>Verify authority</Button>}
             {platform&&s.status==='verified'&&<Button disabled={busy}
               onClick={()=>void act({action:'dispatch',signerId:s.id},
                'A signing invitation was accepted by the email provider.')}>Send signing invitation</Button>}
           </div>
         )}</div>
         {platform&&status.signers.some(s=>s.status==='requested')&&
           <div className="mt-4 max-w-md"><Field label="Verified procurement authority evidence reference" htmlFor="authority-ref"
             hint="Keep the actual delegation in restricted business records.">
             <Input id="authority-ref" value={authorityRef} onChange={e=>setAuthorityRef(e.target.value)}/></Field></div>}
       </Card>}
      {platform&&status.state==='customer_signed'&&
       <Card className="p-5">
        <h2 className="text-lg font-semibold">SafeBus countersignature</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          The customer signed this package. Only an authorized representative of Sachman Gold Inc. may countersign its exact revision.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
         <Field label="Authorized SafeBus signer's name" htmlFor="provider-name"><Input id="provider-name" value={providerName} onChange={e=>setProviderName(e.target.value)}/></Field>
         <Field label="Title" htmlFor="provider-title"><Input id="provider-title" value={providerTitle} onChange={e=>setProviderTitle(e.target.value)}/></Field>
         <div className="sm:col-span-2"><Field label="Verified signing-authority reference" htmlFor="provider-ref"><Input id="provider-ref" value={providerRef} onChange={e=>setProviderRef(e.target.value)}/></Field></div>
        </div>
        <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={providerConsent} onChange={e=>setProviderConsent(e.target.checked)}/>
         I have authority to bind Sachman Gold Inc. and consent to sign the exact versioned agreement package electronically.</label>
        <Button className="mt-4" disabled={busy||!providerConsent||!recordPattern.test(providerRef)||!providerName.trim()||!providerTitle.trim()}
          onClick={()=>void act({action:'countersign',tenantId,bundleHash:status.bundleHash,
           providerName,providerTitle,providerAuthorityRef:providerRef,electronicConsent:true},
           'SafeBus countersignature recorded. Operational approval remains separate.')}>Countersign exact package</Button>
       </Card>}
      {platform&&status.state==='executed'&&
       <Card className="p-5">
         <h2 className="text-lg font-semibold">Final activation evidence</h2>
         <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Only activate after the actual privacy, operations, pilot, supplier and security approvals have passed. References alone are not proof: review source evidence outside Git.
         </p>
         <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Object.keys(activationRefs).map(k=>
           <Field key={k} label={`${k[0].toUpperCase()}${k.slice(1)} evidence reference`} htmlFor={`ref-${k}`}>
            <Input id={`ref-${k}`} value={activationRefs[k]} onChange={e=>setActivationRefs(prev=>({...prev,[k]:e.target.value}))}/></Field>)}
         </div>
         <Button className="mt-4" disabled={busy||!Object.values(activationRefs).every(x=>recordPattern.test(x))}
           onClick={()=>void act({action:'activate',tenantId,bundleHash:status.bundleHash,
             approvalRefs:activationRefs},'District agreement activated after the required approvals.')}>Record reviewed activation</Button>
       </Card>}
      {agreementIsReady(status)&&
       <Card className="p-5"><div className="flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-[var(--color-success-text)]"/>
        <div><h2 className="font-semibold">Agreement access is ready</h2>
         <p className="text-sm text-[var(--color-text-muted)]">Continue to the district billing and operational setup according to your permissions.</p>
         {!platform&&<Link to="/admin/settings/billing" className="mt-2 inline-block font-semibold text-[var(--color-action)] underline">Continue to billing</Link>}
        </div>
       </div></Card>}
      <p className="text-xs text-[var(--color-text-muted)]">
       All customer names, authorizations, signed documents and contract versions must be reviewed before any live execution. Agreement status does not replace school authority privacy assessments.
      </p>
    </>}
   </div>
  </DashboardLayout>
 );
}
