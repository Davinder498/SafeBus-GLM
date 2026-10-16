import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Link2,
  Mail,
  Phone,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { StudentSearchPicker } from '@/components/admin/StudentSearchPicker';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/useAuth';
import { fetchAdminGuardianDetail, type AdminGuardianDetail } from '@/services/adminPeopleService';
import {
  fetchAdminGuardianLinks,
  type GuardianLinkSummary,
} from '@/services/adminPaginationService';
import { revokeGuardianAccess } from '@/services/phase6OperationsService';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import {
  createStudentGuardianLink,
  deactivateStudentGuardianLink,
  deleteGuardian,
  setGuardianAccessExpiry,
} from '@/services/studentGuardianService';

function displayName(detail: AdminGuardianDetail) {
  const structured = `${detail.guardian.first_name} ${detail.guardian.last_name}`.trim();
  return structured || detail.guardian.full_name;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-navy-900">{value}</dd>
    </div>
  );
}

export function AdminGuardianDetailPage() {
  const { guardianId } = useParams<{ guardianId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [detail, setDetail] = useState<AdminGuardianDetail | null>(null);
  const [links, setLinks] = useState<GuardianLinkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('guardian');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Phase 6: audited guardian access revocation state
  const [revokingLinkForId, setRevokingLinkForId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [expiryLinkId, setExpiryLinkId] = useState<string | null>(null);
  const [expiryValue, setExpiryValue] = useState('');

  const canWrite = profile?.role === 'tenant_admin';
  const canRevoke =
    profile?.role === 'tenant_admin' ||
    profile?.role === 'school_admin' ||
    profile?.role === 'transportation_admin';

  const load = useCallback(async () => {
    if (!guardianId) {
      setLoadError('This guardian is not available.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [nextDetail, nextLinks] = await Promise.all([
        fetchAdminGuardianDetail(guardianId),
        fetchAdminGuardianLinks(guardianId),
      ]);
      setDetail(nextDetail);
      setLinks(nextLinks);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load this guardian.');
    } finally {
      setLoading(false);
    }
  }, [guardianId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addLink() {
    if (!guardianId || !studentId || busy) return;
    setBusy(true);
    setWriteError(null);
    setMessage(null);
    try {
      await createStudentGuardianLink({
        studentId,
        guardianId,
        relationship,
        defaultTenantId: profile?.tenant_id ?? null,
      });
      setStudentId('');
      setMessage('Student linked to this guardian.');
      await load();
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to link the student.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivateLink(linkId: string) {
    if (busy) return;
    setBusy(true);
    setWriteError(null);
    setMessage(null);
    try {
      await deactivateStudentGuardianLink(linkId);
      setMessage('Student link deactivated.');
      await load();
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to update the student link.');
    } finally {
      setBusy(false);
    }
  }

  // Phase 6: audited guardian access revocation handler
  async function handleRevokeAccess(linkId: string) {
    setWriteError(null);
    setMessage(null);
    setRevoking(true);
    try {
      await revokeGuardianAccess(linkId, revokeReason.trim() || null);
      setRevokingLinkForId(null);
      setRevokeReason('');
      setMessage('Guardian access revoked and recorded in the audit trail.');
      await load();
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to revoke guardian access.');
    } finally {
      setRevoking(false);
    }
  }

  async function saveAccessExpiry(linkId: string, value = expiryValue) {
    setBusy(true);
    setWriteError(null);
    setMessage(null);
    try {
      await setGuardianAccessExpiry(
        linkId,
        value ? new Date(value).toISOString() : null,
      );
      setExpiryLinkId(null);
      setExpiryValue('');
      setMessage(value ? 'Guardian access expiry updated.' : 'Guardian access expiry removed.');
      await load();
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to update access expiry.');
    } finally {
      setBusy(false);
    }
  }

  async function removeGuardian() {
    if (!guardianId || busy) return;
    setBusy(true);
    setWriteError(null);
    try {
      await deleteGuardian(guardianId);
      navigate('/admin/guardians', { replace: true });
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to delete the guardian.');
      setConfirmDelete(false);
      setBusy(false);
    }
  }

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <Link
          to="/admin/guardians"
          className="inline-flex items-center gap-2 text-sm font-semibold text-navy-700 hover:text-navy-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to guardians
        </Link>
        {loading && (
          <DataState
            title="Loading guardian"
            message="Fetching guardian account and student links."
          />
        )}
        {loadError && <DataState title="Unable to load guardian" message={loadError} />}
        {!loading && detail && (
          <>
            <PageHeader
              eyebrow="Guardian details"
              title={displayName(detail)}
              description="Contact, account access, and linked students are managed here."
              action={
                canWrite ? (
                  <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Delete guardian
                  </Button>
                ) : undefined
              }
            />
            {writeError && (
              <Card className="border-danger-200 bg-danger-50 p-4" role="alert">
                <p className="text-sm font-semibold text-danger-700">{writeError}</p>
              </Card>
            )}
            {message && (
              <Card className="border-success-200 bg-success-50 p-4" role="status">
                <p className="text-sm font-semibold text-success-700">{message}</p>
              </Card>
            )}

            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-navy-50 text-navy-700">
                    <UserRound className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="font-bold text-navy-900">Guardian contact</h2>
                    <p className="text-sm text-slate-600">Used for their SafeBus account.</p>
                  </div>
                </div>
                <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                  <DetailItem label="First name" value={detail.guardian.first_name} />
                  <DetailItem label="Last name" value={detail.guardian.last_name} />
                  <DetailItem label="Email login" value={detail.guardian.email} />
                  <DetailItem label="Phone" value={detail.guardian.phone ?? 'Not provided'} />
                </dl>
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-success-600" aria-hidden />
                  <h2 className="font-bold text-navy-900">Account access</h2>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  This describes login readiness, not whether the guardian is active in a school
                  program.
                </p>
                <div className="mt-4">
                  <StatusPill
                    tone={
                      detail.profile?.status === 'active'
                        ? 'success'
                        : detail.profile?.status === 'invited'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {detail.profile?.status === 'active'
                      ? 'Account activated'
                      : detail.profile?.status === 'invited'
                        ? 'Invitation pending'
                        : 'Account unavailable'}
                  </StatusPill>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4" aria-hidden />
                    Invitation sent to the email login
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4" aria-hidden />
                    {detail.guardian.phone ?? 'No phone provided'}
                  </p>
                </div>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 font-bold text-navy-900">
                    <UsersRound className="h-5 w-5" aria-hidden />
                    Linked students
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Only explicitly linked students are visible to this guardian.
                  </p>
                </div>
              </div>
              {canWrite && (
                <div className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-5 md:grid-cols-[1fr_180px_auto] md:items-end">
                  <StudentSearchPicker value={studentId} onChange={setStudentId} />
                  <label className="text-sm font-semibold text-slate-700">
                    Relationship
                    <select
                      className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                      value={relationship}
                      onChange={(event) => setRelationship(event.target.value)}
                    >
                      <option value="guardian">Guardian</option>
                      <option value="mother">Mother</option>
                      <option value="father">Father</option>
                      <option value="caregiver">Caregiver</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <Button
                    className="w-full md:w-auto"
                    type="button"
                    disabled={!studentId || busy}
                    onClick={() => void addLink()}
                  >
                    <Link2 className="h-4 w-4" aria-hidden />
                    Link student
                  </Button>
                </div>
              )}
              <div className="divide-y divide-slate-100">
                {links.length === 0 && (
                  <p className="p-5 text-sm text-slate-600">No students are linked.</p>
                )}
                {links.map((link) => (
                  <div key={link.id} data-testid={`guardian-link-${link.id}`}>
                    <div className="flex min-h-16 flex-col items-stretch gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-navy-900">
                          {link.student_name}
                        </p>
                        <p className="text-xs capitalize text-slate-500">{link.relationship}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {link.access_expires_at
                            ? `Access ends ${new Date(link.access_expires_at).toLocaleString()}`
                            : 'Access does not expire automatically'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                        <StatusPill tone={link.status === 'active' ? 'success' : 'neutral'}>
                          {link.status === 'active' ? 'Linked' : 'Not linked'}
                        </StatusPill>
                        {link.status === 'active' && (
                          <>
                            {canWrite && (
                              <Button
                                className="w-full sm:w-auto"
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => void deactivateLink(link.id)}
                              >
                                Remove link
                              </Button>
                            )}
                            {canRevoke && (
                              <Button
                                className="w-full sm:w-auto"
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setExpiryLinkId(expiryLinkId === link.id ? null : link.id);
                                  setExpiryValue('');
                                }}
                              >
                                Set expiry
                              </Button>
                            )}
                            {canRevoke && (
                              <Button
                                className="w-full sm:w-auto"
                                type="button"
                                size="sm"
                                variant="danger"
                                data-testid={`revoke-access-toggle-${link.id}`}
                                onClick={() => {
                                  setRevokingLinkForId(
                                    revokingLinkForId === link.id ? null : link.id,
                                  );
                                  setRevokeReason('');
                                }}
                              >
                                Revoke access
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {canRevoke && expiryLinkId === link.id && (
                      <form
                        className="border-t border-slate-100 bg-slate-50 p-4"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveAccessExpiry(link.id);
                        }}
                      >
                        <label
                          className="block text-sm font-semibold text-slate-700"
                          htmlFor={`access-expiry-${link.id}`}
                        >
                          Access expiry (local date and time)
                        </label>
                        <input
                          id={`access-expiry-${link.id}`}
                          type="datetime-local"
                          value={expiryValue}
                          onChange={(event) => setExpiryValue(event.target.value)}
                          className="mt-2 block min-h-11 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500"
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          Access stops automatically at this time. Leave blank to remove an existing expiry.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="submit" size="sm" loading={busy}>Save expiry</Button>
                          {link.access_expires_at && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                void saveAccessExpiry(link.id, '');
                              }}
                            >
                              Remove expiry
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpiryLinkId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}

                    {canRevoke && revokingLinkForId === link.id && (
                      <div
                        className="border-t border-slate-100 bg-slate-50 p-4"
                        data-testid={`revoke-access-form-${link.id}`}
                      >
                        <Field
                          label="Revocation reason (optional)"
                          htmlFor={`revoke-reason-${link.id}`}
                        >
                          <Select
                            id={`revoke-reason-${link.id}`}
                            value={revokeReason}
                            onChange={(e) => setRevokeReason(e.target.value)}
                          >
                            <option value="">No reason selected</option>
                            <option value="authorization_withdrawn">Authorization withdrawn</option>
                            <option value="guardian_request">Guardian request</option>
                            <option value="link_created_in_error">Link created in error</option>
                            <option value="access_no_longer_required">
                              Access no longer required
                            </option>
                          </Select>
                        </Field>
                        <p className="mt-2 text-xs text-slate-500">
                          Revocation is recorded in the audit trail. The link becomes inactive.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            loading={revoking}
                            onClick={() => void handleRevokeAccess(link.id)}
                          >
                            Confirm revoke access
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setRevokingLinkForId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
        <ConfirmDialog
          open={confirmDelete}
          title={`Delete ${detail ? displayName(detail) : 'guardian'}?`}
          description="This permanently deletes the guardian record and its student links. The authentication account is retained for audit and must be handled separately."
          confirmLabel="Delete guardian"
          destructive
          busy={busy}
          onConfirm={() => void removeGuardian()}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    </DashboardLayout>
  );
}
