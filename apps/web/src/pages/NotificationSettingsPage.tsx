import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { AndroidPushDevice, NotificationPreferences } from '@safebus/types';
import { DashboardLayout, adminNavGroups, driverNavGroups, guardianNavGroups, platformNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';
import '@/types/nativePush';
import { fetchNotificationPreferences, listOwnPushDevices, revokeOwnPushDevice, saveNotificationPreferences } from '@/services/notificationService';

export function NotificationSettingsPage() {
  const { profile } = useAuth();
  const [value,setValue]=useState<NotificationPreferences|null>(null); const [devices,setDevices]=useState<AndroidPushDevice[]>([]);
  const [error,setError]=useState<string|null>(null); const [message,setMessage]=useState<string|null>(null); const [saving,setSaving]=useState(false);
  const isAdmin=Boolean(profile?.role&&['tenant_admin','school_admin','transportation_admin','platform_super_admin'].includes(profile.role));
  const nativePushAvailable=window.SafeBusNativePush?.available===true;
  useEffect(()=>{void Promise.all([fetchNotificationPreferences(),isAdmin?Promise.resolve([]):listOwnPushDevices()]).then(([p,d])=>{setValue(p);setDevices(d);}).catch((e:unknown)=>setError(e instanceof Error?e.message:'Settings are unavailable.'));},[isAdmin]);
  const portal=isAdmin?'admin':profile?.role==='driver'?'driver':'parent'; const nav=profile?.role==='platform_super_admin'?platformNavGroups:isAdmin?adminNavGroups:profile?.role==='driver'?driverNavGroups:guardianNavGroups;
  if(error)return <DashboardLayout title="Notification settings" portal={portal} navItems={[]} navGroups={nav}><DataState title="Settings unavailable" message={error}/></DashboardLayout>;
  if(!value)return <DashboardLayout title="Notification settings" portal={portal} navItems={[]} navGroups={nav}><DataState title="Loading settings" message="Checking your notification choices."/></DashboardLayout>;
  const update=(changes:Partial<NotificationPreferences>)=>setValue((current)=>current?{...current,...changes}:current);
  async function save(){if(!value)return;setSaving(true);setMessage(null);try{let next:NotificationPreferences=value;if(next.pushEnabled&&nativePushAvailable){const permission=await window.SafeBusNativePush!.enable();if(permission!=='granted')next={...next,pushEnabled:false};}else if(!next.pushEnabled&&nativePushAvailable){await window.SafeBusNativePush!.deactivate();}setValue(await saveNotificationPreferences(next));setMessage('Notification settings saved.');}catch(e){setMessage(e instanceof Error?e.message:'Could not save settings.');}finally{setSaving(false);}}
  return <DashboardLayout title="Notification settings" portal={portal} navItems={[]} navGroups={nav}><PageHeader title="Notification settings" description="In-app notifications always remain in your authorized inbox. These choices control Android push only."/>
    <form className="space-y-5" onSubmit={(e)=>{e.preventDefault();void save();}}><Card className="space-y-4 p-5">
      {isAdmin?<p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Administrators receive web inbox notifications only.</p>:<div><label className="flex items-start gap-3"><input type="checkbox" checked={value.pushEnabled} disabled={!nativePushAvailable} onChange={(e)=>update({pushEnabled:e.target.checked})}/><span><b>Android push notifications</b><span className="block text-sm text-slate-600">{nativePushAvailable?'Off by default. Android will ask for permission after you save and enable this choice.':'Push is unavailable in this browser or app build. In-app notifications remain available.'}</span></span></label>{nativePushAvailable?<Button type="button" variant="ghost" className="mt-2" onClick={()=>void window.SafeBusNativePush?.openSystemSettings()}>Open Android notification controls</Button>:null}</div>}
      <label className="flex items-center gap-3"><input type="checkbox" checked={value.quietHoursEnabled} onChange={(e)=>update({quietHoursEnabled:e.target.checked})}/>Quiet hours</label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Start<input type="time" value={value.quietHoursStart} onChange={(e)=>update({quietHoursStart:e.target.value})} className="mt-1 block w-full rounded-lg border p-2"/></label><label className="text-sm font-medium">End<input type="time" value={value.quietHoursEnd} onChange={(e)=>update({quietHoursEnd:e.target.value})} className="mt-1 block w-full rounded-lg border p-2"/></label></div>
      <label className="block text-sm font-medium">Timezone override<input value={value.timezoneOverride??''} placeholder={value.timezone} onChange={(e)=>update({timezoneOverride:e.target.value||null})} className="mt-1 block w-full rounded-lg border p-2"/><span className="mt-1 block text-xs font-normal text-slate-500">Use an IANA timezone such as America/Edmonton.</span></label>
      <label className="flex items-center gap-3"><input type="checkbox" checked={value.urgentBypassQuietHours} onChange={(e)=>update({urgentBypassQuietHours:e.target.checked})}/>Allow urgent cancellations, missing service, mechanical issues and road closures during quiet hours</label>
      <fieldset><legend className="font-semibold">Lock-screen preview</legend><label className="mr-5"><input type="radio" name="preview" checked={value.previewMode==='generic'} onChange={()=>update({previewMode:'generic'})}/> Generic and private</label><label><input type="radio" name="preview" checked={value.previewMode==='limited'} onChange={()=>update({previewMode:'limited'})}/> Event type only</label><p className="mt-1 text-xs text-slate-500">Previews never show names, routes, stops, coordinates, drivers or internal IDs.</p></fieldset>
      {!isAdmin?<fieldset><legend className="font-semibold">Push categories</legend>{(['pickup_dropoff','trip_status','service_changes','assignments','operations'] as const).map((key)=><label key={key} className="mt-2 flex items-center gap-3"><input type="checkbox" checked={value.categories[key]??false} onChange={(e)=>update({categories:{...value.categories,[key]:e.target.checked}})}/>{key.replaceAll('_',' ')}</label>)}</fieldset>:null}
      <Button type="submit" disabled={saving}>{saving?'Saving…':'Save settings'}</Button>{message?<p role="status" className="text-sm text-slate-700">{message}</p>:null}
    </Card></form>
    {!isAdmin?<Card className="mt-5 p-5"><h2 className="font-semibold text-slate-950">Registered Android devices</h2>{devices.length===0?<p className="mt-2 text-sm text-slate-600">No device is registered.</p>:<ul className="mt-3 divide-y">{devices.map((d)=><li key={d.id} className="flex items-center justify-between gap-3 py-3"><span><b>{d.deviceModel??'Android device'}</b><span className="block text-xs text-slate-500">{d.status} · last refreshed {new Date(d.lastSeenAt).toLocaleDateString()}</span></span><Button variant="secondary" onClick={()=>void revokeOwnPushDevice(d.id).then(()=>setDevices((all)=>all.filter((x)=>x.id!==d.id)))}>Revoke</Button></li>)}</ul>}</Card>:null}
    {profile?.role==='guardian'?<Card className="mt-5 p-5"><h2 className="font-semibold text-slate-950">Pickup and drop-off email</h2><p className="mt-1 text-sm text-slate-600">Existing email delivery remains separately opt-in for each linked student and event.</p><Link className="mt-3 inline-block font-semibold text-blue-700 underline" to="/notifications/settings/email">Manage guardian email choices</Link></Card>:null}
  </DashboardLayout>;
}
