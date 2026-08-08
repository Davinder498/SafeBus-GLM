import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/contexts/useAuth';
import {
  fetchTenantAdmins,
  fetchTenantSchools,
  fetchTenantAdminInvitations,
  changeAdminRole,
  transferAdministrator,
} from '@/services/tenantAdminService';
import {
  departAdministrator,
  inviteAdministrator,
  restoreAdministrator,
  suspendAdministrator,
  updateInvitation,
} from '@/services/onboardingService';
import type {
  AdminProfile,
  TenantAdminInvitation,
  TenantSchoolOption,
} from '@/services/tenantAdminService';

export function AdminAdministratorsPage() {
  const { profile } = useAuth();
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeAdminCount, setActiveAdminCount] = useState(0);
  const [schools, setSchools] = useState<TenantSchoolOption[]>([]);
  const [schoolSelections, setSchoolSelections] = useState<Record<string, string>>({});
  const [invitations, setInvitations] = useState<TenantAdminInvitation[]>([]);
  const [busy, setBusy] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [departTarget, setDepartTarget] = useState<AdminProfile | null>(null);
  const [transferTarget, setTransferTarget] = useState<AdminProfile | null>(null);

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'tenant_admin' | 'school_admin' | 'transportation_admin'>('school_admin');
  const [inviteSchoolId, setInviteSchoolId] = useState('');

  const isAdmin = profile?.role === 'tenant_admin';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adminList, schoolList, invitationList] = await Promise.all([
        fetchTenantAdmins(),
        fetchTenantSchools(),
        fetchTenantAdminInvitations(),
      ]);
      setAdmins(adminList);
      setSchools(schoolList);
      setInvitations(invitationList);
      setActiveAdminCount(
        adminList.filter((admin) => admin.role === 'tenant_admin' && admin.status === 'active').length,
      );
      setSchoolSelections(
        Object.fromEntries(adminList.map((admin) => [admin.id, admin.school_id ?? ''])),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load administrators.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteName || !inviteEmail || !inviteRole) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await inviteAdministrator({
        fullName: inviteName,
        email: inviteEmail,
        role: inviteRole,
        schoolId: inviteRole === 'school_admin' ? inviteSchoolId || undefined : undefined,
      });
      setSuccess(`Invitation sent to ${inviteEmail}.`);
      setInviteName('');
      setInviteEmail('');
      setInviteRole('school_admin');
      setInviteSchoolId('');
      setShowInviteForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(profileId: string, newRole: string, schoolId?: string) {
    setBusy(true);
    setError(null);
    try {
      const selectedSchoolId = schoolId ?? schoolSelections[profileId] ?? '';
      if (newRole === 'school_admin' && !selectedSchoolId) {
        throw new Error('Choose an active school before assigning the school administrator role.');
      }
      await changeAdminRole(profileId, newRole, newRole === 'school_admin' ? selectedSchoolId : null);
      setSuccess('Administrator role updated.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to change role.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer(profileId: string) {
    setBusy(true);
    setError(null);
    try {
      await transferAdministrator(profileId);
      setSuccess('Administrator transferred to tenant administrator.');
      setTransferTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to transfer administrator.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDepart(profileId: string) {
    setBusy(true);
    setError(null);
    try {
      await departAdministrator(profileId);
      setSuccess('Administrator departed.');
      setDepartTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to process departure.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(profileId: string) {
    setBusy(true);
    setError(null);
    try {
      await restoreAdministrator(profileId);
      setSuccess('Administrator restored to active status.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to restore administrator.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSuspend(profileId: string) {
    setBusy(true);
    setError(null);
    try {
      await suspendAdministrator(profileId);
      setSuccess('Administrator suspended. Sign-in is blocked until restoration.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to suspend administrator.');
    } finally {
      setBusy(false);
    }
  }

  async function handleInvitationAction(
    invitation: TenantAdminInvitation,
    action: 'resend' | 'revoke',
  ) {
    setBusy(true);
    setError(null);
    try {
      await updateInvitation(invitation.id, action);
      setSuccess(action === 'resend' ? 'Invitation resent with a new expiry.' : 'Invitation revoked.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update invitation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Administration"
          title="Administrators"
          description="Manage tenant administrators, school administrators, and transportation administrators. Multiple administrators ensure operational independence."
          action={
            isAdmin ? (
              <Button type="button" onClick={() => setShowInviteForm((v) => !v)}>
                Add administrator
              </Button>
            ) : undefined
          }
        />

        <Card className="border-navy-100 bg-navy-50 p-5">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-2xl font-bold text-navy-900">{activeAdminCount}</p>
              <p className="text-sm font-semibold text-navy-700">Active tenant administrator(s)</p>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-600">
                {activeAdminCount <= 1
                  ? '⚠ Add at least one more administrator to ensure the tenant can operate independently if one is unavailable.'
                  : '✓ This tenant has multiple active administrators.'}
              </p>
            </div>
          </div>
        </Card>

        {showInviteForm && (
          <Card className="p-5">
            <h2 className="text-lg font-bold text-navy-900">Invite administrator</h2>
            <p className="mt-1 text-sm text-slate-600">
              The email becomes the login. SafeBus sends a secure activation link.
            </p>
            <form className="mt-5 space-y-4" onSubmit={handleInvite}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-gray-700" htmlFor="inv-name">
                    Full name
                  </label>
                  <input
                    id="inv-name"
                    type="text"
                    required
                    maxLength={200}
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700" htmlFor="inv-email">
                    Email address
                  </label>
                  <input
                    id="inv-email"
                    type="email"
                    required
                    maxLength={320}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700" htmlFor="inv-role">
                    Role
                  </label>
                  <select
                    id="inv-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
                  >
                    <option value="tenant_admin">Tenant administrator</option>
                    <option value="school_admin">School administrator</option>
                    <option value="transportation_admin">Transportation administrator</option>
                  </select>
                </div>
                {inviteRole === 'school_admin' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700" htmlFor="inv-school">
                      School
                    </label>
                    <select
                      id="inv-school"
                      value={inviteSchoolId}
                      onChange={(e) => setInviteSchoolId(e.target.value)}
                      required
                      className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
                    >
                      <option value="">Choose a school</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>{school.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" loading={busy}>
                  Send invitation
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setShowInviteForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {invitations.length > 0 && (
          <Card className="p-5">
            <h2 className="text-lg font-bold text-navy-900">Administrator invitations</h2>
            <div className="mt-4 space-y-3">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-navy-900">{invitation.full_name}</p>
                    <p className="text-sm text-slate-600">
                      {invitation.email} · {invitation.role} · {invitation.status} · delivery {invitation.delivery_status}
                    </p>
                  </div>
                  {['pending', 'resent', 'failed'].includes(invitation.status) && (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void handleInvitationAction(invitation, 'resend')}>
                        Resend
                      </Button>
                      <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => void handleInvitationAction(invitation, 'revoke')}>
                        Revoke
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {error && (
          <Card className="border-danger-200 bg-danger-50 p-4" role="alert">
            <p className="text-sm font-semibold text-danger-700">{error}</p>
          </Card>
        )}
        {success && (
          <Card className="border-success-200 bg-success-50 p-4" role="status">
            <p className="text-sm font-semibold text-success-700">{success}</p>
          </Card>
        )}

        {loading && <DataState title="Loading administrators" message="Fetching administrator profiles." />}
        {!loading && !error && admins.length === 0 && (
          <DataState title="No administrators" message="Invite an administrator to get started." />
        )}

        {!loading && !error && admins.length > 0 && (
          <section className="grid gap-4">
            {admins.map((admin) => (
              <Card key={admin.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-navy-900">{admin.full_name}</h3>
                    <p className="mt-1 text-sm text-gray-600">{admin.email}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <RoleBadge role={admin.role} />
                      <StatusPill>{admin.status}</StatusPill>
                    </div>
                  </div>
                  {isAdmin && admin.status !== 'invited' && (
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={admin.role}
                        onChange={(e) => void handleRoleChange(admin.id, e.target.value)}
                        disabled={busy || admin.id === profile?.id}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        aria-label={`Change role for ${admin.full_name}`}
                      >
                        <option value="tenant_admin">Tenant admin</option>
                        <option value="school_admin">School admin</option>
                        <option value="transportation_admin">Transportation admin</option>
                      </select>
                      <select
                        value={schoolSelections[admin.id] ?? ''}
                        onChange={(e) => {
                          const schoolId = e.target.value;
                          setSchoolSelections((current) => ({ ...current, [admin.id]: schoolId }));
                          if (admin.role === 'school_admin' && schoolId) {
                            void handleRoleChange(admin.id, 'school_admin', schoolId);
                          }
                        }}
                        disabled={busy}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        aria-label={`School scope for ${admin.full_name}`}
                      >
                        <option value="">School scope</option>
                        {schools.map((school) => (
                          <option key={school.id} value={school.id}>{school.name}</option>
                        ))}
                      </select>
                      {admin.role !== 'tenant_admin' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setTransferTarget(admin)}
                        >
                          Promote to tenant admin
                        </Button>
                      )}
                      {(admin.status === 'disabled' || admin.status === 'suspended') && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void handleRestore(admin.id)}
                        >
                          Restore
                        </Button>
                      )}
                      {admin.status === 'active' && admin.id !== profile?.id && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void handleSuspend(admin.id)}
                        >
                          Suspend
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        disabled={busy || admin.id === profile?.id}
                        onClick={() => setDepartTarget(admin)}
                      >
                        Depart
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </section>
        )}

        <ConfirmDialog
          open={!!departTarget}
          title={`Depart ${departTarget?.full_name ?? 'administrator'}?`}
          description="This deactivates the administrator account. They will no longer be able to sign in. This action is audited and can be reversed by restoring the account."
          confirmLabel="Process departure"
          destructive
          busy={busy}
          onConfirm={() => departTarget && void handleDepart(departTarget.id)}
          onCancel={() => setDepartTarget(null)}
        />
        <ConfirmDialog
          open={!!transferTarget}
          title={`Promote ${transferTarget?.full_name ?? 'administrator'}?`}
          description="This transfers the administrator to a full tenant administrator role with full tenant-wide permissions."
          confirmLabel="Promote to tenant admin"
          busy={busy}
          onConfirm={() => transferTarget && void handleTransfer(transferTarget.id)}
          onCancel={() => setTransferTarget(null)}
        />
      </div>
    </DashboardLayout>
  );
}
