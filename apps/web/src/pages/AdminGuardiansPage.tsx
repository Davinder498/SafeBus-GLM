import { useState, type FormEvent } from 'react';
import { CheckCircle2, CircleDashed, Eye, Mail, Phone, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { StudentSearchPicker } from '@/components/admin/StudentSearchPicker';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/contexts/useAuth';
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import { inviteTenantMember } from '@/services/onboardingService';
import type { Guardian } from '@/types/studentGuardian';

type GuardianRow = Guardian & { active_link_count: number };

const emptyInvite = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  studentId: '',
  relationship: 'guardian',
};

function guardianName(guardian: Guardian) {
  return `${guardian.first_name} ${guardian.last_name}`.trim() || guardian.full_name;
}

export function AdminGuardiansPage() {
  const { profile } = useAuth();
  const list = usePaginatedAdminList<GuardianRow>('guardians');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState(emptyInvite);
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const canInvite = profile?.role === 'tenant_admin';

  async function inviteGuardian(event: FormEvent) {
    event.preventDefault();
    if (inviting) return;
    setInviting(true);
    setWriteError(null);
    setMessage(null);
    try {
      await inviteTenantMember({
        role: 'guardian',
        firstName: inviteForm.firstName,
        lastName: inviteForm.lastName,
        email: inviteForm.email,
        phone: inviteForm.phone,
        studentLinks: inviteForm.studentId
          ? [{ studentId: inviteForm.studentId, relationship: inviteForm.relationship }]
          : [],
      });
      setInviteForm(emptyInvite);
      setShowInviteForm(false);
      setMessage('Guardian invitation sent. The email link lets them activate their account securely.');
      await list.reload();
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to invite guardian.');
    } finally {
      setInviting(false);
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Guardians"
          title="Guardians"
          description="A focused directory of guardian contacts and student links."
          action={
            canInvite ? (
              <Button type="button" onClick={() => setShowInviteForm((value) => !value)}>
                Invite guardian
              </Button>
            ) : undefined
          }
        />

        {showInviteForm && (
          <Card className="p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Secure invitation</p>
              <h2 className="mt-1 text-lg font-bold text-navy-900">Add guardian</h2>
              <p className="mt-1 text-sm text-slate-600">
                The email becomes the login. SafeBus sends the activation link; admins never handle passwords.
              </p>
            </div>
            <form className="mt-5 space-y-4" onSubmit={(event) => void inviteGuardian(event)}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="First name" htmlFor="guardian-first-name" required>
                  <Input id="guardian-first-name" maxLength={100} autoComplete="given-name" required value={inviteForm.firstName} onChange={(event) => setInviteForm({ ...inviteForm, firstName: event.target.value })} />
                </Field>
                <Field label="Last name" htmlFor="guardian-last-name" required>
                  <Input id="guardian-last-name" maxLength={100} autoComplete="family-name" required value={inviteForm.lastName} onChange={(event) => setInviteForm({ ...inviteForm, lastName: event.target.value })} />
                </Field>
                <Field label="Email address" htmlFor="guardian-email" hint="Guardian login" required>
                  <Input id="guardian-email" type="email" maxLength={320} autoComplete="email" required value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} />
                </Field>
                <Field label="Phone number" htmlFor="guardian-phone" required>
                  <Input id="guardian-phone" type="tel" maxLength={40} autoComplete="tel" required value={inviteForm.phone} onChange={(event) => setInviteForm({ ...inviteForm, phone: event.target.value })} />
                </Field>
                <Field label="Relationship" htmlFor="guardian-relationship">
                  <Select id="guardian-relationship" value={inviteForm.relationship} onChange={(event) => setInviteForm({ ...inviteForm, relationship: event.target.value })}>
                    <option value="guardian">Guardian</option>
                    <option value="mother">Mother</option>
                    <option value="father">Father</option>
                    <option value="caregiver">Caregiver</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Link a student now" hint="Optional">
                  <StudentSearchPicker value={inviteForm.studentId} onChange={(studentId) => setInviteForm({ ...inviteForm, studentId })} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={inviting}>Send invitation</Button>
                <Button type="button" variant="secondary" disabled={inviting} onClick={() => setShowInviteForm(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        {writeError && <Card className="border-danger-200 bg-danger-50 p-4" role="alert"><p className="text-sm font-semibold text-danger-700">{writeError}</p></Card>}
        {message && <Card className="border-success-200 bg-success-50 p-4" role="status"><p className="text-sm font-semibold text-success-700">{message}</p></Card>}

        <Field label="Search guardians" htmlFor="guardian-search">
          <Input id="guardian-search" type="search" value={list.searchInput} onChange={(event) => list.setSearchInput(event.target.value)} placeholder="Search by name, email, or phone" />
        </Field>

        {list.loading && <DataState title="Loading guardians" message="Fetching guardian records visible to you." />}
        {list.error && <DataState title="Unable to load guardians" message={list.error} />}
        {!list.loading && !list.error && list.rows.length === 0 && <DataState title="No guardians match" message="Invite a guardian or try a different search." />}

        {!list.loading && !list.error && list.rows.length > 0 && (
          <section className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[760px] table-fixed text-left">
                <thead className="border-b border-slate-200 bg-slate-50/80">
                  <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-[30%] px-5 py-3">Guardian</th>
                    <th className="w-[28%] px-5 py-3">Email</th>
                    <th className="w-[22%] px-5 py-3">Phone</th>
                    <th className="w-[12%] px-5 py-3">Students</th>
                    <th className="w-[8%] px-5 py-3 text-right"><span className="sr-only">View</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.rows.map((guardian) => (
                    <tr key={guardian.id} className="h-16 whitespace-nowrap transition-colors hover:bg-slate-50/70">
                      <td className="overflow-hidden px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700"><UserRound className="h-4 w-4" aria-hidden /></span>
                          <span className="truncate font-bold text-navy-900">{guardianName(guardian)}</span>
                        </div>
                      </td>
                      <td className="overflow-hidden px-5 py-3"><span className="flex min-w-0 items-center gap-2 text-slate-600"><Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /><span className="truncate">{guardian.email}</span></span></td>
                      <td className="overflow-hidden px-5 py-3"><span className="flex min-w-0 items-center gap-2 text-slate-600"><Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /><span className="truncate">{guardian.phone ?? 'Not provided'}</span></span></td>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2 text-sm text-slate-600">
                          {guardian.active_link_count > 0 ? <CheckCircle2 className="h-4 w-4 text-success-600" aria-hidden /> : <CircleDashed className="h-4 w-4 text-slate-400" aria-hidden />}
                          {guardian.active_link_count}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link to={`/admin/guardians/${guardian.id}`} aria-label={`View ${guardianName(guardian)}`} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"><Eye className="h-4 w-4" aria-hidden />View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination page={list.page} pageSize={list.pageSize} totalCount={list.totalCount} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
