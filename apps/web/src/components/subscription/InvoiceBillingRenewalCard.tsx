import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fetchInvoiceBillingArrangement, manageInvoiceRenewal } from '@/services/invoiceBillingService';

export function InvoiceBillingRenewalCard({canceled,onUpdated}:{
  canceled:boolean;
  onUpdated:()=>Promise<unknown>;
}) {
  const [open,setOpen] = useState(false);
  const [arrangement,setArrangement] = useState<'none'|'activated'|'other'>('none');
  const [busy,setBusy] = useState(false);
  const [confirmed,setConfirmed] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);

  async function show(){
    setOpen(!open);
    if(open)return;
    setBusy(true);setError(null);
    try{
      const status=await fetchInvoiceBillingArrangement();
      setArrangement(status.status==='activated'?'activated':'other');
    }catch{setError('Unable to verify invoice terms securely.');}
    finally{setBusy(false);}
  }
  async function change(){
    if(!confirmed||busy)return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const result=await manageInvoiceRenewal(!canceled);
      if(!result.ok)throw new Error('The renewal change was not confirmed.');
      setNotice(!canceled
        ? 'Invoice subscription renewal is canceled at period end. Existing invoices remain due.'
        : 'Automatic recurring invoice renewal was restored.');
      setConfirmed(false);
      await onUpdated();
    }catch(cause){setError(cause instanceof Error?cause.message:'Invoice renewal change failed.');}
    finally{setBusy(false);}
  }

  return <Card className="p-5 sm:p-6" data-ui="tenant-invoice-renewal">
    <h2 className="text-lg font-bold text-[var(--color-heading)]">Invoice subscription renewal</h2>
    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
      Monthly service is month-to-month; annual service has a 12-month term.
      Both renew automatically unless canceled. No early cancellation fee applies.
      Cancellation stops renewal at the end of the current trial or paid term.
      Paid periods are not partially refunded unless required by law or expressly
      agreed. Invoices already issued remain payable.
    </p>
    <Button type="button" variant="secondary" className="mt-3" onClick={()=>void show()}>
      {open?'Hide invoice renewal':'Review invoice renewal'}
    </Button>
    {open&&<div className="mt-4 space-y-3">
      {error&&<p role="alert" className="text-sm text-[var(--color-danger-text)]">{error}</p>}
      {notice&&<p role="status" className="text-sm">{notice}</p>}
      {busy&&<p role="status" className="text-sm">Verifying invoice renewal…</p>}
      {arrangement==='activated'&&<>
        <label className="flex min-h-11 gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5"
            checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
          {canceled
            ? 'I authorize resuming automatic recurring invoices at the approved price.'
            : 'I authorize canceling invoice renewal at the end of the current trial or paid term. No early cancellation fee applies; existing invoices remain payable.'}
        </label>
        <Button type="button" disabled={!confirmed||busy} loading={busy}
          onClick={()=>void change()}>
          {canceled?'Resume recurring invoices':'Cancel invoice renewal'}
        </Button>
      </>}
      {arrangement==='other'&&<p className="text-sm">
        This subscription predates the approved online invoice workflow. Contact SafeBus
        support for contract changes.
      </p>}
    </div>}
  </Card>;
}
