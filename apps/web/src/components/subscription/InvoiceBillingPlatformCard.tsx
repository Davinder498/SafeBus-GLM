import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  fetchInvoiceBillingArrangement, reviewInvoiceBilling,
  type InvoiceBillingArrangement,
} from '@/services/invoiceBillingService';

export function InvoiceBillingPlatformCard({tenantId}: {tenantId:string}) {
  const [open,setOpen]=useState(false);
  const [status,setStatus]=useState<InvoiceBillingArrangement|null>(null);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [days,setDays]=useState(30);
  const [confirmed,setConfirmed]=useState(false);

  async function refresh(){
    setLoading(true);setError(null);
    try{
      const result=await fetchInvoiceBillingArrangement(tenantId);
      setStatus(result);
      if(result.daysUntilDue)setDays(result.daysUntilDue);
    }catch{setError('Invoice approval status could not be verified. Retry.');}
    finally{setLoading(false);}
  }
  async function review(approve:boolean){
    if(!status?.requestId||busy||!confirmed)return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const value=await reviewInvoiceBilling(tenantId,status.requestId,approve,days);
      setStatus(value);setConfirmed(false);
      setNotice(approve?'Invoice terms approved; only the tenant administrator can activate billing.'
        :'Invoice billing request declined; no subscription or invoice created.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Invoice review not confirmed.');}
    finally{setBusy(false);}
  }

  return <Card className="mt-5 space-y-4 p-5 sm:p-6" data-ui="platform-invoice-approval">
    <h2 className="font-bold text-[var(--color-heading)]">Invoice / purchase-order approval</h2>
    <p className="text-sm text-[var(--color-text-muted)]">
      District administrators request invoice billing from their billing page.
      Only platform administrators can approve; approval does not start or charge a subscription.
    </p>
    <Button type="button" variant="secondary" onClick={()=>{
      setOpen(!open);
      if(!open)void refresh();
    }}>{open?'Hide invoice requests':'Review invoice requests'}</Button>
    {open&&<>
      {error&&<p role="alert" className="text-sm text-[var(--color-danger-text)]">{error}</p>}
      {notice&&<p role="status" className="text-sm">{notice}</p>}
      {loading?<p role="status">Checking invoice request…</p>:<>
        <p className="text-sm">Status: <strong>{status?.status??'Unavailable'}</strong></p>
        {status?.status==='pending'&&<>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold">Price ID</dt><dd className="break-all">{status.priceId}</dd></div>
            <div><dt className="font-semibold">Bus allowance</dt><dd>{status.quantity}</dd></div>
            <div><dt className="font-semibold">Billing email</dt><dd className="break-all">{status.billingEmail}</dd></div>
            <div><dt className="font-semibold">Purchase order</dt><dd>{status.purchaseOrder||'None provided'}</dd></div>
            <div><dt className="font-semibold">Invoice billing address</dt>
              <dd>{status.addressLine1}, {status.city}, {status.province} {status.postalCode}, Canada</dd></div>
          </dl>
          <label className="block text-sm font-semibold" htmlFor="invoice-due-days">
            Payment due after invoice (days)
          </label>
          <select id="invoice-due-days" className="min-h-11 w-full max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            value={days} onChange={event=>{setDays(Number(event.target.value));setConfirmed(false);}}>
            {[14,30,45,60].map(d=><option key={d} value={d}>{d} days</option>)}
          </select>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input className="mt-1 h-5 w-5" type="checkbox" checked={confirmed}
              onChange={event=>setConfirmed(event.target.checked)}/>
            I have reviewed this specific school authority, its billing contact, current
            signed contract, selected rate and payment arrangement, and authorize this invoice route.
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={!confirmed||busy} loading={busy}
              onClick={()=>void review(true)}>Approve invoice arrangement</Button>
            <Button type="button" variant="secondary" disabled={!confirmed||busy}
              onClick={()=>void review(false)}>Decline request</Button>
          </div>
        </>}
        {status?.status==='approved'&&<p className="text-sm">
          Approved and awaiting the school authority administrator's explicit activation.
          No invoice has been sent by this approval.
        </p>}
        {status?.status==='activated'&&<p className="text-sm">
          Invoice billing activated. Confirm its current status in the subscription panel.
        </p>}
        <Button type="button" variant="outline" disabled={busy} onClick={()=>void refresh()}>
          Refresh invoice status
        </Button>
      </>}
    </>}
  </Card>;
}
