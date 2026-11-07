import { useEffect, useState } from 'react';
import { FileCheck2, ShieldCheck } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { agreementKinds, districtAgreementRequest, type AgreementKind, type SignerPreview } from '@/services/districtAgreementService';

function getLinkToken() {
  const query = new URLSearchParams(window.location.hash.replace(/^#/,''));
  const token = query.get('token') ?? '';
  // Remove the token from browser history without requiring an additional
  // round trip or allowing third-party analytics to see the fragment.
  window.history.replaceState(window.history.state,'',window.location.pathname);
  return /^[A-Za-z0-9_-]{43}$/.test(token)?token:'';
}
export function DistrictAgreementSignerPage() {
 const [token,setToken]=useState<string|null>(null);
 const [preview,setPreview]=useState<SignerPreview|null>(null);
 const [selected,setSelected]=useState<AgreementKind>('msa');
 const [reviewed,setReviewed]=useState<AgreementKind[]>([]);
 const [electronicConsent,setElectronicConsent]=useState(false);
 const [bindingAuthority,setBindingAuthority]=useState(false);
 const [name,setName]=useState('');
 const [title,setTitle]=useState('');
 const [error,setError]=useState<string|null>(null);
 const [finished,setFinished]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
   const value=getLinkToken();
   setToken(value);
   if (!value){setError('The signing link is invalid or has expired. Contact SafeBus for a new invitation.');setLoading(false);return;}
   let active=true;
   void districtAgreementRequest<SignerPreview>({action:'signer_preview',token:value})
     .then(result=>{if(active){setPreview(result);setName(result.signerName);setTitle(result.signerTitle);}})
     .catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to validate signing link.');})
     .finally(()=>{if(active)setLoading(false);});
   return ()=>{active=false};
 },[]);
 async function sign() {
   if (!token||!preview||busy)return;
   setError(null);setBusy(true);
   try {
     const result=await districtAgreementRequest<{state:string}>({
       action:'signer_sign',token,bundleHash:preview.bundleHash,
       signerName:name,signerTitle:title,electronicConsent,bindingAuthority,
     });
     if(result.state!=='customer_signed')throw new Error('Signature status could not be confirmed.');
     setFinished(true);setToken(null);
   }catch(e){setError(e instanceof Error?e.message:'Signing was not confirmed. Contact SafeBus.');}
   finally{setBusy(false);}
 }
 const document=preview?.documents.find(d=>d.kind===selected);
 const allReviewed=agreementKinds.every(d=>reviewed.includes(d.kind));
 return <PublicLayout>
  <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
   <div className="mb-6 flex items-start gap-3">
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-action)]"><FileCheck2/></div>
    <div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Secure agreement review</p>
     <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">School authority agreements</h1>
     <p className="mt-2 text-sm text-[var(--color-text-muted)]">Review all documents before signing on behalf of your school authority.</p></div>
   </div>
   {error&&<Card className="mb-5 p-5"><p role="alert" className="text-sm font-semibold text-[var(--color-danger-text)]">{error}</p></Card>}
   {loading&&<Card className="p-8"><p role="status">Verifying your secure agreement invitation…</p></Card>}
   {finished&&<Card className="p-8">
    <ShieldCheck className="h-10 w-10 text-[var(--color-success-text)]"/>
    <h2 className="mt-3 text-xl font-semibold">Your electronic signature was recorded</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
     SafeBus must countersign and complete the required privacy and operational approvals before the district can activate its transportation service. A completed signature is not proof that service has been activated.
    </p>
   </Card>}
   {preview&&!finished&&<>
    <Card className="mb-5 p-5">
     <div className="flex flex-wrap justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Authorized signer invitation</p>
       <p className="mt-1 font-semibold">{preview.signerName} · {preview.signerTitle}</p>
       <p className="mt-1 text-xs text-[var(--color-text-muted)]">Package revision {preview.revision} · SHA-256 {preview.bundleHash.slice(0,12)}…</p></div>
      <p className="text-sm text-[var(--color-text-muted)]">Link expires: {new Date(preview.expiresAt).toLocaleString()}</p>
     </div>
    </Card>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
     <Card className="min-w-0 overflow-hidden">
      <div className="border-b border-[var(--color-border)] p-5">
       <h2 className="text-lg font-semibold">Full agreement documents</h2>
       <p className="mt-2 text-sm text-[var(--color-text-muted)]">Read each of the eight sections. Review does not count as signing.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto border-b border-[var(--color-border)] p-3" role="tablist" aria-label="Agreement documents">
       {agreementKinds.map(d=><button key={d.kind} type="button" role="tab" aria-selected={selected===d.kind}
        id={`sign-tab-${d.kind}`} aria-controls="sign-document-content"
        onClick={()=>setSelected(d.kind)}
        className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${selected===d.kind?'bg-[var(--color-selection)] text-[var(--color-action)]':'text-[var(--color-text-muted)]'}`}>
        {reviewed.includes(d.kind)?'✓ ':''}{d.label}</button>)}
      </div>
      <div id="sign-document-content" role="tabpanel" aria-labelledby={`sign-tab-${selected}`} className="p-5 sm:p-6">
       <h3 className="text-lg font-bold">{document?.title}</h3>
       <p className="mt-1 text-xs text-[var(--color-text-muted)]">Version {document?.version}</p>
       <pre className="mt-5 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[var(--color-text)]">{document?.body}</pre>
       <label className="mt-6 flex items-center gap-3 rounded-lg border border-[var(--color-border)] p-3 text-sm">
        <input className="h-5 w-5 accent-[var(--color-action)]" type="checkbox"
         checked={reviewed.includes(selected)}
         onChange={e=>setReviewed(prev=>e.target.checked?[...prev,selected]:prev.filter(k=>k!==selected))}/>
        I have reviewed this complete document.</label>
      </div>
     </Card>
     <Card className="h-fit p-5 lg:sticky lg:top-28">
      <h2 className="text-lg font-semibold">Electronic signature</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">All eight documents must be reviewed. Only the officer whose delegated authority was verified may sign.</p>
      <p className="mt-4 text-xs font-semibold text-[var(--color-text-muted)]">{reviewed.length} of 8 documents reviewed</p>
      <div className="mt-4 space-y-3">
       <Field label="Verified signer's full name" htmlFor="electronic-name" required>
        <Input id="electronic-name" value={name} onChange={e=>setName(e.target.value)}/></Field>
       <Field label="Official title" htmlFor="electronic-title" required>
        <Input id="electronic-title" value={title} onChange={e=>setTitle(e.target.value)}/></Field>
       <label className="flex items-start gap-3 text-sm"><input className="mt-1 h-4 w-4" type="checkbox"
        checked={electronicConsent} onChange={e=>setElectronicConsent(e.target.checked)}/>
        I consent to using electronic records and an electronic signature for this agreement package.</label>
       <label className="flex items-start gap-3 text-sm"><input className="mt-1 h-4 w-4" type="checkbox"
        checked={bindingAuthority} onChange={e=>setBindingAuthority(e.target.checked)}/>
        I am the named, authorized officer and intend to bind the school authority to the exact documents displayed.</label>
       <Button fullWidth disabled={busy||!allReviewed||!electronicConsent||!bindingAuthority||!name.trim()||!title.trim()} onClick={()=>void sign()}>
        {busy?'Recording signature…':'Sign agreement package'}</Button>
       <p className="text-xs leading-5 text-[var(--color-text-muted)]">If you are not authorized to sign, stop here and contact the district administrator. This link provides no access to student records.</p>
      </div>
     </Card>
    </div>
   </>}
  </main>
 </PublicLayout>;
}
