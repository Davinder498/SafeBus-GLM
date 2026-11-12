import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { createLatestAgreementFileReader } from '@/utils/latestAgreementFileReader';
import { FileCheck2, ShieldCheck } from 'lucide-react';
import { DashboardLayout, platformNavItems } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  listPlatformAgreementDocuments,getPlatformAgreementCatalog,publishAgreementCatalog,
  publishAgreementDocument,type AgreementCatalog,type AgreementDocumentVersion,
} from '@/services/districtAgreementService';
import {
  getPublishedParticipantTerms,publishParticipantTerms,type PublishedParticipantTerms,
} from '@/services/participantAgreementService';

const kinds=[
  {kind:'msa',label:'Master Services Agreement'},
  {kind:'dpa',label:'Data Processing Agreement'},
  {kind:'order_form',label:'Order Form / Commercial Terms'},
  {kind:'security',label:'Security Schedule'},
  {kind:'sla',label:'Service-Level Agreement'},
  {kind:'acceptable_use',label:'Acceptable Use Terms'},
  {kind:'data_return',label:'Data Return & Destruction'},
  {kind:'suppliers',label:'Supplier Disclosure'},
] as const;

export function PlatformAgreementsPage() {
  const [documents,setDocuments]=useState<AgreementDocumentVersion[]>([]);
  const [catalog,setCatalog]=useState<AgreementCatalog|null>(null);
  const [chosen,setChosen]=useState<Record<string,string>>({});
  const [kind,setKind]=useState<string>('msa');
  const [title,setTitle]=useState<string>('Master Services Agreement');
  const [version,setVersion]=useState('');
  const [text,setText]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [approved,setApproved]=useState(false);
  const [confirmCatalog,setConfirmCatalog]=useState(false);
  const [participantTerms,setParticipantTerms]=useState<PublishedParticipantTerms|null>(null);
  const [participantDocument,setParticipantDocument]=useState('');
  const [confirmParticipant,setConfirmParticipant]=useState(false);
  const fileReader = useMemo(createLatestAgreementFileReader, []);
  useEffect(() => () => fileReader.invalidate(), [fileReader]);
  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    try {
      const [docs,latest,participant]=await Promise.all([
        listPlatformAgreementDocuments(),getPlatformAgreementCatalog(),
        getPublishedParticipantTerms(),
      ]);
      setDocuments(docs);setCatalog(latest);setParticipantTerms(participant);
      setChosen(prev=>{
        const next={...prev};
        for(const item of kinds)if(!next[item.kind]){
          // Keep an already published package; never auto-select a participant-only or new document.
          const doc=docs.find(d=>d.kind===item.kind && latest.document_ids?.includes(d.id));
          if(doc)next[item.kind]=doc.id;
        }
        return next;
      });
    }catch(cause){setError(cause instanceof Error?cause.message:'Agreement catalog unavailable.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function publishDoc(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||!approved)return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const result=await publishAgreementDocument({kind,title:title.trim(),version:version.trim(),body:text});
      if(result.sha256!==undefined){
        setNotice('Approved version published. The document is immutable.');
        setVersion('');setText('');setApproved(false);await load();
      }else throw new Error('The document publication was not confirmed.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Publication failed.');}
    finally{setBusy(false);}
  }
  async function publishSet(){
    if(busy||!confirmCatalog||kinds.some(k=>!chosen[k.kind]))return;
    setBusy(true);setError(null);setNotice(null);
    try {
      const result=await publishAgreementCatalog(kinds.map(k=>chosen[k.kind]));
      if(result.published!==true)throw new Error('Catalog publication not confirmed.');
      setNotice('Agreement package published for the district administrator portal.');
      setConfirmCatalog(false);await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Catalog publication failed.');}
    finally{setBusy(false);}
  }
  async function publishParticipant(){
    if(busy||!confirmParticipant||!participantDocument)return;
    setBusy(true);setError(null);setNotice(null);
    try {
      await publishParticipantTerms(participantDocument);
      setNotice('Approved mobile Terms of Use published for driver and guardian invitations.');
      setConfirmParticipant(false);await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Terms publication failed.');}
    finally{setBusy(false);}
  }
  return <DashboardLayout title="Platform Admin" portal="admin" navItems={platformNavItems}>
    <div className="space-y-6">
      <PageHeader eyebrow="Platform administration" title="Digital agreement templates"
        description="Approve immutable SafeBus MSA/DPA document versions, then publish one complete package for school authorities."/>
      {error&&<p role="alert" className="rounded-lg border border-[var(--color-danger-outline)] p-4 text-[var(--color-danger-text)]">{error}</p>}
      {notice&&<p role="status" className="rounded-lg border border-[var(--color-border)] p-4">{notice}</p>}
      {loading?<Card className="p-6"><p role="status">Loading approved versions…</p></Card>:<>
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-[var(--color-action)]"/>
            <h2 className="font-bold text-[var(--color-heading)]">Current published package</h2>
          </div>
          <p className="text-sm">Revision: {catalog?.revision??'Not published'}</p>
          {catalog?.content_sha256&&<p className="break-all text-xs text-[var(--color-text-muted)]">
            SHA-256: {catalog.content_sha256}</p>}
          <p className="text-sm text-[var(--color-text-muted)]">
            Only upload final documents that have actually been approved for legal and
            commercial use. Existing draft files in GitHub are not executable contract terms.
          </p>
        </Card>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-5 p-5">
            <h2 className="text-lg font-bold text-[var(--color-heading)]">1. Publish approved document</h2>
            <form className="space-y-4" onSubmit={e=>void publishDoc(e)}>
              <Field label="Document type" htmlFor="agreement-kind" required>
                <select id="agreement-kind" className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
                  value={kind} onChange={e=>{
                    fileReader.invalidate();
                    setText('');
                    setKind(e.target.value);
                    setTitle(kinds.find(k=>k.kind===e.target.value)?.label??'');
                    setApproved(false);
                  }}>
                  {kinds.map(k=><option value={k.kind} key={k.kind}>{k.label}</option>)}
                </select>
              </Field>
              <Field label="Document title" htmlFor="agreement-document-title" required>
                <Input id="agreement-document-title" value={title} required
                  onChange={e=>{setTitle(e.target.value);setApproved(false);}}/>
              </Field>
              <Field label="New immutable version" htmlFor="agreement-version" required>
                <Input id="agreement-version" value={version} required placeholder="e.g. 2026.1"
                  onChange={e=>{setVersion(e.target.value);setApproved(false);}}/>
              </Field>
              <Field label="Final approved Markdown contract" htmlFor="agreement-document-upload" required>
                <input key={kind} id="agreement-document-upload" type="file" accept=".md,.txt,text/markdown,text/plain"
                  className="block min-h-11 w-full text-sm" onChange={e=>{
                    const file=e.target.files?.[0];
                    fileReader.invalidate();
                    // Clear old contract text immediately: a stale file must not
                    // be approved while a replacement is still being read.
                    setText('');
                    setApproved(false);
                    setError(null);
                    if(!file)return;
                    if(file.size>150000){setError('The maximum document size is 150 KB.');return;}
                    void fileReader.read(file).then(nextText=>{
                      if(nextText!==null)setText(nextText);
                    }).catch(()=>setError('Document could not be read.'));
                  }}/>
              </Field>
              {text&&<div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--color-text-muted)]">
                  Full document preview ({text.length.toLocaleString()} characters)
                </p>
                <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 text-xs">{text}</div>
              </div>}
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}
                  className="mt-1 h-5 w-5" required/>
                I confirm that this complete version has received the necessary business/legal approval,
                contains no unresolved placeholders, and is intended for customer acceptance.
              </label>
              <Button type="submit" fullWidth disabled={busy||!approved||text.length<100}
                loading={busy}>Approve immutable version</Button>
            </form>
          </Card>
          <Card className="space-y-5 p-5">
            <h2 className="text-lg font-bold text-[var(--color-heading)]">2. Publish complete contract package</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Choose one finalized version for every section. Publishing makes these
              specific documents available to school authority administrators.
              Updating the package creates a new revision; existing executed receipts remain immutable.
            </p>
            {kinds.map(k=><div key={k.kind}>
              <label className="mb-2 block text-sm font-semibold" htmlFor={`published-${k.kind}`}>
                {k.label}
              </label>
              <select id={`published-${k.kind}`} value={chosen[k.kind]??''}
                onChange={e=>{setChosen(prev=>({...prev,[k.kind]:e.target.value}));setConfirmCatalog(false);}}
                className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm">
                <option value="">Select approved version</option>
                {documents.filter(d=>d.kind===k.kind).map(d=><option key={d.id} value={d.id}>
                  {d.version} — {d.title}
                </option>)}
              </select>
            </div>)}
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input type="checkbox" checked={confirmCatalog} onChange={e=>setConfirmCatalog(e.target.checked)}
                className="mt-1 h-5 w-5"/>
              These eight versions are approved as one binding package, including
              commercial order terms and the DPA's actual supplier disclosure.
            </label>
            <Button type="button" fullWidth disabled={busy||!confirmCatalog||
              kinds.some(k=>!chosen[k.kind])} loading={busy} onClick={()=>void publishSet()}>
              Publish agreement package
            </Button>
            <div className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
              <ShieldCheck className="h-5 w-5 shrink-0"/>
              No school authority can accept an unapproved or missing package.
            </div>
            <Link className="text-sm font-semibold text-[var(--color-action)] underline"
              to="/admin/tenants">Return to school authorities</Link>
          </Card>
        </div>
        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold text-[var(--color-heading)]">3. Driver and guardian Terms of Use</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Publish a separately approved Acceptable Use version for mobile participants.
            This is not the school authority MSA/DPA, and the Privacy Notice remains a separate acknowledgment.
          </p>
          <p className="text-sm">Currently published: {participantTerms?.status==='published'
            ? participantTerms.version : participantTerms?.status==='unavailable'
              ? 'Pending database installation' : 'None'}</p>
          <label className="block text-sm font-semibold" htmlFor="participant-terms-document">
            Approved participant Terms of Use version
          </label>
          <select id="participant-terms-document" value={participantDocument}
            onChange={e=>{setParticipantDocument(e.target.value);setConfirmParticipant(false);}}
            className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm">
            <option value="">Select approved version</option>
            {documents.filter(d=>d.kind==='acceptable_use').map(d=><option key={d.id} value={d.id}>
              {d.version} — {d.title}
            </option>)}
          </select>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={confirmParticipant}
              onChange={e=>setConfirmParticipant(e.target.checked)}/>
            I confirm this exact complete version was approved for driver and guardian acceptance.
            Publishing changes the terms offered to participants; it does not activate optional location or notifications.
          </label>
          <Button type="button" disabled={busy||participantTerms?.status==='unavailable'||!confirmParticipant||!participantDocument}
            loading={busy} onClick={()=>void publishParticipant()}>Publish participant Terms of Use</Button>
        </Card>
      </>}
    </div>
  </DashboardLayout>;
}
