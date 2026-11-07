import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getTenantAgreementStatus, agreementIsReady, type AgreementStatus } from '@/services/districtAgreementService';

export function TenantAgreementGate({ children }: {children:ReactNode}) {
 const loc=useLocation();
 const [status,setStatus]=useState<AgreementStatus|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [retry,setRetry]=useState(0);
 const exempt=loc.pathname==='/admin/onboarding/agreements'
   || loc.pathname==='/account/security'
   || loc.pathname==='/account/security/password'
   || loc.pathname==='/account/security/mfa';
 useEffect(()=>{
  if(exempt)return;
  let active=true;
  setStatus(null);setError(null);
  void getTenantAgreementStatus().then(d=>{if(active)setStatus(d);})
   .catch(()=>{if(active)setError('SafeBus cannot verify this school authority’s agreement. Access is temporarily restricted.');});
  return ()=>{active=false};
 },[exempt,retry]);
 if(exempt)return children;
 if(!status && !error)return <Card className="mx-auto max-w-xl p-6"><p role="status">Checking school authority agreement approval…</p></Card>;
 if(error)return <Card className="mx-auto max-w-xl space-y-4 p-6">
   <h1 className="text-lg font-bold">Agreement verification unavailable</h1>
   <p role="alert">{error}</p>
   <Button onClick={()=>setRetry(n=>n+1)}>Retry verification</Button>
   <Link className="block font-semibold text-[var(--color-action)] underline" to="/admin/onboarding/agreements">Review agreement status</Link>
  </Card>;
 if(status&&!agreementIsReady(status))return <Card className="mx-auto max-w-xl p-6">
   <h1 className="text-xl font-bold">Finish your school authority agreement</h1>
   <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
     Your account is active, but district transportation and billing access will become available only after the required agreement and approvals are completed.
   </p>
   <Link className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--color-action)] px-4 font-semibold text-[var(--color-on-action)]"
     to="/admin/onboarding/agreements">Review agreements</Link>
  </Card>;
 return children;
}
