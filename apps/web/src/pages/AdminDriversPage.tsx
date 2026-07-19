import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Mail, Phone, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminPagination } from '@/components/admin/AdminPagination';
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
import type { Driver } from '@/types/transportation';

type DriverRow = Driver & {
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  email: string;
};

const emptyInvite = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  licenseNumber: '',
  licenseIssueDate: '',
  licenseExpiryDate: '',
  licenseClass: '5',
  addressLine1: '',
  addressLine2: '',
  city: '',
  province: 'AB',
  postalCode: '',
};

function driverName(driver: DriverRow) {
  return `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim() || driver.full_name;
}

function formatDate(value: string | null) {
  if (!value) return 'Not provided';
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function licenceNeedsAttention(expiry: string | null) {
  if (!expiry) return true;
  const warningDate = new Date();
  warningDate.setDate(warningDate.getDate() + 60);
  return new Date(`${expiry}T23:59:59`) <= warningDate;
}

export function AdminDriversPage() {
  const { profile } = useAuth();
  const list = usePaginatedAdminList<DriverRow>('drivers');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState(emptyInvite);
  const [inviting, setInviting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canInvite = profile?.role === 'tenant_admin';

  async function inviteDriver(event: FormEvent) {
    event.preventDefault();
    if (inviting) return;
    if (inviteForm.licenseExpiryDate < inviteForm.licenseIssueDate) {
      setWriteError('Licence expiry date must be on or after the issue date.');
      return;
    }
    setInviting(true);
    setWriteError(null);
    setMessage(null);
    try {
      await inviteTenantMember({ role: 'driver', ...inviteForm });
      setInviteForm(emptyInvite);
      setShowInviteForm(false);
      setMessage('Driver invitation sent. The email link lets them activate their account securely.');
      await list.reload();
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to invite driver.');
    } finally {
      setInviting(false);
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Drivers"
          title="Drivers"
          description="A focused driver directory with licence readiness at a glance."
          action={canInvite ? <Button type="button" onClick={() => setShowInviteForm((value) => !value)}>Invite driver</Button> : undefined}
        />

        {showInviteForm && (
          <Card className="p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Secure invitation</p>
              <h2 className="mt-1 text-lg font-bold text-navy-900">Add driver</h2>
              <p className="mt-1 text-sm text-slate-600">The email becomes the login. Licence and address details stay tenant-scoped behind RLS.</p>
            </div>
            <form className="mt-5 space-y-5" onSubmit={(event) => void inviteDriver(event)}>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Field label="First name" htmlFor="driver-first-name" required><Input id="driver-first-name" maxLength={100} autoComplete="given-name" required value={inviteForm.firstName} onChange={(event) => setInviteForm({ ...inviteForm, firstName: event.target.value })} /></Field>
                <Field label="Last name" htmlFor="driver-last-name" required><Input id="driver-last-name" maxLength={100} autoComplete="family-name" required value={inviteForm.lastName} onChange={(event) => setInviteForm({ ...inviteForm, lastName: event.target.value })} /></Field>
                <Field label="Email address" htmlFor="driver-email" hint="Driver login" required><Input id="driver-email" type="email" maxLength={320} autoComplete="email" required value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} /></Field>
                <Field label="Phone number" htmlFor="driver-phone" required><Input id="driver-phone" type="tel" maxLength={40} autoComplete="tel" required value={inviteForm.phone} onChange={(event) => setInviteForm({ ...inviteForm, phone: event.target.value })} /></Field>
              </div>

              <div className="border-t border-slate-200 pt-5">
                <h3 className="font-bold text-navy-900">Alberta driver licence</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Field label="Licence number" htmlFor="driver-licence-number" required><Input id="driver-licence-number" maxLength={64} required value={inviteForm.licenseNumber} onChange={(event) => setInviteForm({ ...inviteForm, licenseNumber: event.target.value })} /></Field>
                  <Field label="Issue date" htmlFor="driver-licence-issue" required><Input id="driver-licence-issue" type="date" required value={inviteForm.licenseIssueDate} onChange={(event) => setInviteForm({ ...inviteForm, licenseIssueDate: event.target.value })} /></Field>
                  <Field label="Expiry date" htmlFor="driver-licence-expiry" required><Input id="driver-licence-expiry" type="date" min={inviteForm.licenseIssueDate || undefined} required value={inviteForm.licenseExpiryDate} onChange={(event) => setInviteForm({ ...inviteForm, licenseExpiryDate: event.target.value })} /></Field>
                  <Field label="Licence class" htmlFor="driver-licence-class" required><Select id="driver-licence-class" required value={inviteForm.licenseClass} onChange={(event) => setInviteForm({ ...inviteForm, licenseClass: event.target.value })}>{['1', '2', '3', '4', '5', '6', '7'].map((value) => <option key={value} value={value}>Class {value}</option>)}</Select></Field>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-5">
                <h3 className="font-bold text-navy-900">Mailing address</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Field label="Address line 1" htmlFor="driver-address-1" required className="lg:col-span-2"><Input id="driver-address-1" maxLength={160} autoComplete="address-line1" required value={inviteForm.addressLine1} onChange={(event) => setInviteForm({ ...inviteForm, addressLine1: event.target.value })} /></Field>
                  <Field label="Address line 2" htmlFor="driver-address-2" hint="Optional" className="lg:col-span-2"><Input id="driver-address-2" maxLength={160} autoComplete="address-line2" value={inviteForm.addressLine2} onChange={(event) => setInviteForm({ ...inviteForm, addressLine2: event.target.value })} /></Field>
                  <Field label="City" htmlFor="driver-city" required><Input id="driver-city" maxLength={100} autoComplete="address-level2" required value={inviteForm.city} onChange={(event) => setInviteForm({ ...inviteForm, city: event.target.value })} /></Field>
                  <Field label="Province" htmlFor="driver-province" required><Input id="driver-province" maxLength={2} autoComplete="address-level1" required value={inviteForm.province} onChange={(event) => setInviteForm({ ...inviteForm, province: event.target.value.toUpperCase() })} /></Field>
                  <Field label="Postal code" htmlFor="driver-postal-code" required><Input id="driver-postal-code" maxLength={7} autoComplete="postal-code" required value={inviteForm.postalCode} onChange={(event) => setInviteForm({ ...inviteForm, postalCode: event.target.value.toUpperCase() })} /></Field>
                </div>
              </div>
              <div className="flex flex-wrap gap-2"><Button type="submit" loading={inviting}>Send invitation</Button><Button type="button" variant="secondary" disabled={inviting} onClick={() => setShowInviteForm(false)}>Cancel</Button></div>
            </form>
          </Card>
        )}

        {writeError && <Card className="border-danger-200 bg-danger-50 p-4" role="alert"><p className="text-sm font-semibold text-danger-700">{writeError}</p></Card>}
        {message && <Card className="border-success-200 bg-success-50 p-4" role="status"><p className="text-sm font-semibold text-success-700">{message}</p></Card>}

        <Field label="Search drivers" htmlFor="driver-search"><Input id="driver-search" type="search" value={list.searchInput} onChange={(event) => list.setSearchInput(event.target.value)} placeholder="Search by name, email, phone, or licence number" /></Field>
        {list.loading && <DataState title="Loading drivers" message="Fetching driver records visible to you." />}
        {list.error && <DataState title="Unable to load drivers" message={list.error} />}
        {!list.loading && !list.error && list.rows.length === 0 && <DataState title="No drivers match" message="Invite a driver or try a different search." />}

        {!list.loading && !list.error && list.rows.length > 0 && (
          <section className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[820px] table-fixed text-left">
                <thead className="border-b border-slate-200 bg-slate-50/80"><tr className="text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="w-[27%] px-5 py-3">Driver</th><th className="w-[27%] px-5 py-3">Email</th><th className="w-[20%] px-5 py-3">Phone</th><th className="w-[18%] px-5 py-3">Licence</th><th className="w-[8%] px-5 py-3 text-right"><span className="sr-only">Driver actions</span></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {list.rows.map((driver) => {
                    const needsAttention = licenceNeedsAttention(driver.license_expiry_date);
                    return <tr key={driver.id} className="h-16 whitespace-nowrap transition-colors hover:bg-slate-50/70">
                      <td className="overflow-hidden px-5 py-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700"><UserRound className="h-4 w-4" aria-hidden /></span><span className="truncate font-bold text-navy-900" title={driverName(driver)}>{driverName(driver)}</span></div></td>
                      <td className="overflow-hidden px-5 py-3"><span className="flex min-w-0 items-center gap-2 text-slate-600"><Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /><span className="truncate" title={driver.email}>{driver.email}</span></span></td>
                      <td className="overflow-hidden px-5 py-3"><span className="flex min-w-0 items-center gap-2 text-slate-600"><Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /><span className="truncate" title={driver.phone ?? 'Not provided'}>{driver.phone ?? 'Not provided'}</span></span></td>
                      <td className="px-5 py-3"><span className={`flex items-center gap-2 text-sm ${needsAttention ? 'text-warning-700' : 'text-slate-600'}`}>{needsAttention ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" aria-hidden />}<span>{driver.license_expiry_date ? `Expires ${formatDate(driver.license_expiry_date)}` : 'Details required'}</span></span></td>
                      <td className="px-5 py-3 text-right"><Link to={`/admin/drivers/${driver.id}`} aria-label={`View ${driverName(driver)}`} title="View driver" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-navy-700 transition-colors hover:bg-navy-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2"><Eye className="h-4 w-4" aria-hidden /></Link></td>
                    </tr>;
                  })}
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
