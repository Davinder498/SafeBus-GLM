import { useEffect, useState, type FormEvent } from 'react';
import { MailPlus, Plus, UserRoundCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { inviteTenantMember } from '@/services/onboardingService';
import {
  createStudentGuardianLink,
  getVisibleGuardians,
  setStudentGuardianLinkStatus,
} from '@/services/studentGuardianService';
import type { AdminStudentDetail } from '@/services/adminStudentsService';
import type { Guardian, StudentGuardianRelationship } from '@/types/studentGuardian';

const field = 'mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm';
const relationships: StudentGuardianRelationship[] = ['guardian', 'mother', 'father', 'caregiver', 'other'];

export function StudentGuardianManager({ detail, tenantId, onChanged }: {
  detail: AdminStudentDetail;
  tenantId: string | null;
  onChanged: (message: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'closed' | 'existing' | 'new'>('closed');
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [guardianId, setGuardianId] = useState('');
  const [relationship, setRelationship] = useState<StudentGuardianRelationship>('guardian');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'existing') return;
    void getVisibleGuardians().then(setGuardians).catch(() => setError('Guardian options could not be loaded.'));
  }, [mode]);

  async function addGuardian(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'existing') {
        if (!guardianId) throw new Error('Choose an existing guardian.');
        await createStudentGuardianLink({ studentId: detail.student.id, guardianId, relationship, defaultTenantId: tenantId });
        await onChanged('Guardian connected to this student.');
      } else {
        if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
          throw new Error('First name, last name, email, and phone are required.');
        }
        await inviteTenantMember({
          role: 'guardian', firstName, lastName, email, phone,
          studentLinks: [{ studentId: detail.student.id, relationship }],
        });
        await onChanged('Guardian invitation sent and connected to this student.');
      }
      setMode('closed');
      setGuardianId('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Guardian could not be added.');
    } finally {
      setBusy(false);
    }
  }

  async function updateLink(link: AdminStudentDetail['guardianLinks'][number]) {
    setError(null);
    setBusy(true);
    try {
      const status = link.status === 'active' ? 'inactive' : 'active';
      await setStudentGuardianLinkStatus({ linkId: link.id, status, comment, adminNote: note });
      setEditingLinkId(null);
      setComment('');
      setNote('');
      await onChanged(status === 'active' ? 'Guardian connection activated.' : 'Guardian connection deactivated.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Guardian connection could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function resendInvitation(link: AdminStudentDetail['guardianLinks'][number]) {
    setError(null);
    setBusy(true);
    try {
      await inviteTenantMember({
        role: 'guardian',
        firstName: link.guardian.first_name,
        lastName: link.guardian.last_name,
        email: link.guardian.email,
        phone: link.guardian.phone ?? '',
        studentLinks: [{ studentId: detail.student.id, relationship: link.relationship }],
      });
      await onChanged(`Invitation sent to ${link.guardian.email}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Invitation could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-4 space-y-3">
    {error && <p className="rounded-lg bg-danger-50 p-3 text-sm font-semibold text-danger-700">{error}</p>}
    {detail.guardianLinks.length === 0 && <p className="text-sm text-slate-600">No guardian is connected.</p>}
    {detail.guardianLinks.map((link) => <div key={link.id} className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-navy-900">{link.guardian.full_name}</p>
          <p className="text-sm text-slate-600">{link.guardian.email}{link.guardian.phone ? ` · ${link.guardian.phone}` : ''}</p>
          <p className="mt-1 text-xs capitalize text-slate-500">{link.relationship}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={link.status === 'active' ? 'success' : 'neutral'}>{link.status === 'active' ? 'Connected' : 'Inactive'}</StatusPill>
          <StatusPill tone={link.profileStatus === 'active' ? 'success' : 'warning'}>{link.profileStatus === 'active' ? 'Account active' : 'Invitation pending'}</StatusPill>
        </div>
      </div>
      {(link.admin_note || link.status_comment) && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        {link.status_comment && <p><span className="font-semibold">Latest status comment:</span> {link.status_comment}</p>}
        {link.admin_note && <p><span className="font-semibold">Internal note:</span> {link.admin_note}</p>}
      </div>}
      {link.profileStatus !== 'active' && <Button className="mt-3" size="sm" type="button" variant="outline" disabled={busy || !link.guardian.phone} onClick={() => void resendInvitation(link)}>Send invitation again</Button>}
      {editingLinkId === link.id ? <div className="mt-3 grid gap-3">
        <label className="text-sm font-semibold text-slate-700">{link.status === 'active' ? 'Reason for deactivation' : 'Reason for activation'}<input className={field} maxLength={300} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
        <label className="text-sm font-semibold text-slate-700">Internal admin note (optional)<textarea className={field} rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <div className="flex gap-2"><Button size="sm" type="button" disabled={busy || !comment.trim()} onClick={() => void updateLink(link)}>Confirm</Button><Button size="sm" type="button" variant="secondary" onClick={() => setEditingLinkId(null)}>Cancel</Button></div>
      </div> : <Button className="mt-3" size="sm" type="button" variant="ghost" onClick={() => { setEditingLinkId(link.id); setComment(link.status_comment ?? ''); setNote(link.admin_note ?? ''); }}>{link.status === 'active' ? 'Deactivate connection' : 'Activate connection'}</Button>}
    </div>)}

    {mode === 'closed' ? <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setMode('existing')}>Connect existing guardian</Button>
      <Button type="button" size="sm" variant="outline" leftIcon={<MailPlus className="h-4 w-4" />} onClick={() => setMode('new')}>Invite new guardian</Button>
    </div> : <form className="rounded-xl border border-navy-100 bg-navy-50/40 p-4" onSubmit={(event) => void addGuardian(event)}>
      <div className="mb-3 flex items-center gap-2"><UserRoundCheck className="h-5 w-5 text-navy-700" /><h3 className="font-bold text-navy-900">{mode === 'existing' ? 'Connect existing guardian' : 'Invite new guardian'}</h3></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {mode === 'existing' ? <label className="text-sm font-semibold text-slate-700">Guardian<select className={field} value={guardianId} onChange={(event) => setGuardianId(event.target.value)}><option value="">Choose guardian</option>{guardians.filter((guardian) => !detail.guardianLinks.some((link) => link.guardian_id === guardian.id)).map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.full_name} — {guardian.email}</option>)}</select></label> : <>
          <label className="text-sm font-semibold text-slate-700">First name<input className={field} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700">Last name<input className={field} value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700">Email<input className={field} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700">Phone<input className={field} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        </>}
        <label className="text-sm font-semibold text-slate-700">Relationship<select className={field} value={relationship} onChange={(event) => setRelationship(event.target.value as StudentGuardianRelationship)}>{relationships.map((item) => <option key={item} value={item} className="capitalize">{item}</option>)}</select></label>
      </div>
      <div className="mt-4 flex gap-2"><Button type="submit" size="sm" disabled={busy}>{mode === 'new' ? 'Send invitation' : 'Connect guardian'}</Button><Button type="button" size="sm" variant="secondary" onClick={() => setMode('closed')}>Cancel</Button></div>
    </form>}
  </div>;
}
