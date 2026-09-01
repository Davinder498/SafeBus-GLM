import { useEffect, useState } from 'react';
import type { NotificationDeliveryHealthV2 } from '@safebus/types';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { fetchNotificationDeliveryHealth } from '@/services/notificationService';
import { formatNotificationFailureCategory } from '@/types/notificationDelivery';

function age(timestamp: string | null): string {
  if (!timestamp) return 'None';
  const seconds = Math.max(0, (Date.now() - Date.parse(timestamp)) / 1000);
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 360) / 10}h`;
  return `${Math.round(seconds / 8640) / 10}d`;
}

export function NotificationDeliverySummaryCard() {
  const [health, setHealth] = useState<NotificationDeliveryHealthV2 | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { let active = true; fetchNotificationDeliveryHealth().then((result) => { if (active) setHealth(result); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, []);
  if (error) return <Card className="p-5"><h2 className="text-xl font-bold text-navy-900">Notification delivery</h2><DataState title="Summary unavailable" message="The delivery-health service is temporarily unavailable." /></Card>;
  if (!health) return <Card className="p-5"><h2 className="text-xl font-bold text-navy-900">Notification delivery</h2><DataState title="Loading summary" message="Checking email and push delivery." /></Card>;
  return <Card className="p-5"><h2 className="text-xl font-bold text-navy-900">Notification delivery</h2><p className="mt-1 text-sm text-slate-600">Tenant-safe aggregate health only; no recipient, message, token or provider identifiers are shown.</p>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><Channel title="Guardian email" pending={health.email.pending} retrying={health.email.retrying} failed={health.email.failed} oldest={age(health.email.oldestPendingAt)} /><Channel title="Android push" pending={health.push.pending} retrying={health.push.retrying} failed={health.push.failed} oldest={age(health.push.oldestPendingAt)} extra={`Invalid/stale devices: ${health.push.invalidDevices}`} /></div>
    {health.push.recentFailureCategories.length ? <div className="mt-5"><h3 className="text-sm font-bold text-slate-700">Recent push failure categories</h3><ul className="mt-2 flex flex-wrap gap-2">{health.push.recentFailureCategories.map((item)=><li key={item.category} className="rounded-md border bg-slate-50 px-3 py-1 text-xs">{formatNotificationFailureCategory(item.category)}: {item.count}</li>)}</ul></div> : <p className="mt-5 text-sm text-slate-500">No recent push failures.</p>}
  </Card>;
}

function Channel({ title,pending,retrying,failed,oldest,extra }:{title:string;pending:number;retrying:number;failed:number;oldest:string;extra?:string}) {
  return <section aria-label={title} className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-950">{title}</h3><dl className="mt-3 grid grid-cols-2 gap-3"><Stat label="Pending" value={pending}/><Stat label="Retries" value={retrying}/><Stat label="Failures" value={failed}/><Stat label="Oldest pending" value={oldest}/></dl>{extra?<p className="mt-3 text-xs text-slate-600">{extra}</p>:null}</section>;
}
function Stat({label,value}:{label:string;value:string|number}) { return <div><dt className="text-xs uppercase text-slate-500">{label}</dt><dd className="text-lg font-bold text-slate-900">{value}</dd></div>; }
