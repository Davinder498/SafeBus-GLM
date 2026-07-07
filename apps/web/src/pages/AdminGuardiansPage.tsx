import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { getVisibleProfiles } from '@/services/adminOrganizationService';
import {
  createStudentGuardianLink,
  deactivateStudentGuardianLink,
  getVisibleGuardians,
  getVisibleStudentGuardianLinks,
  getVisibleStudents,
} from '@/services/studentGuardianService';
import type { OrganizationProfile } from '@/types/organization';
import type { Guardian, GuardianStatus, Student, StudentGuardian } from '@/types/studentGuardian';

const guardianStatusTone: Record<GuardianStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  suspended: 'warning',
  archived: 'danger',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function studentDisplayName(student: Student): string {
  return student.preferred_name
    ? `${student.first_name} ${student.last_name} (${student.preferred_name})`
    : `${student.first_name} ${student.last_name}`;
}

export function AdminGuardiansPage() {
  const { profile } = useAuth();
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [links, setLinks] = useState<StudentGuardian[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedGuardianId, setExpandedGuardianId] = useState<string | null>(null);
  const [linkingGuardianId, setLinkingGuardianId] = useState<string | null>(null);
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkRelationship, setLinkRelationship] = useState('guardian');
  const [pendingLinkAction, setPendingLinkAction] = useState<string | null>(null);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextGuardians, nextProfiles, nextLinks, nextStudents] = await Promise.all([
        getVisibleGuardians(),
        getVisibleProfiles(),
        getVisibleStudentGuardianLinks(),
        getVisibleStudents(),
      ]);
      setGuardians(nextGuardians);
      setProfiles(nextProfiles);
      setLinks(nextLinks);
      setStudents(nextStudents);
    } catch (guardiansError) {
      setError(guardiansError instanceof Error ? guardiansError.message : 'Unable to load guardians.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const profileLabels = useMemo(() => {
    return new Map(profiles.map((p) => [p.id, `${p.full_name} (${p.email})`]));
  }, [profiles]);

  const studentMap = useMemo(() => {
    return new Map(students.map((s) => [s.id, s]));
  }, [students]);

  /** Links grouped by guardian_id for quick lookup. */
  const linksByGuardian = useMemo(() => {
    const map = new Map<string, StudentGuardian[]>();
    for (const link of links) {
      const arr = map.get(link.guardian_id) ?? [];
      arr.push(link);
      map.set(link.guardian_id, arr);
    }
    return map;
  }, [links]);

  /** Active student IDs already linked to a given guardian (for eligible-student filtering). */
  const linkedStudentIdsForGuardian = useCallback(
    (guardianId: string): Set<string> => {
      const guardianLinks = linksByGuardian.get(guardianId) ?? [];
      return new Set(
        guardianLinks.filter((l) => l.status === 'active').map((l) => l.student_id),
      );
    },
    [linksByGuardian],
  );

  const filteredGuardians = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return guardians;
    return guardians.filter((guardian) => {
      return [
        guardian.full_name,
        guardian.email,
        guardian.phone,
        guardian.status,
        profileLabels.get(guardian.profile_id),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [guardians, profileLabels, query]);

  async function handleCreateLink(guardianId: string) {
    if (pendingLinkAction) return;
    if (!linkStudentId) {
      setWriteError('Select a student to link.');
      return;
    }
    setPendingLinkAction(guardianId);
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createStudentGuardianLink({
        studentId: linkStudentId,
        guardianId,
        relationship: linkRelationship,
        defaultTenantId: profile?.tenant_id ?? null,
      });
      setLinkingGuardianId(null);
      setLinkStudentId('');
      setLinkRelationship('guardian');
      setSuccessMessage('Student linked to guardian.');
      await reload();
    } catch (createError) {
      const msg = createError instanceof Error ? createError.message : 'Unable to create link.';
      // Check for duplicate constraint
      if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('unique')) {
        setWriteError('This student is already linked to this guardian.');
      } else {
        setWriteError(msg);
      }
    } finally {
      setPendingLinkAction(null);
    }
  }

  async function handleDeactivateLink(linkId: string, guardianName: string) {
    if (pendingLinkAction) return;
    setPendingLinkAction(linkId);
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await deactivateStudentGuardianLink(linkId);
      setSuccessMessage(`Link deactivated for ${guardianName}.`);
      await reload();
    } catch (deactivateError) {
      setWriteError(deactivateError instanceof Error ? deactivateError.message : 'Unable to deactivate link.');
    } finally {
      setPendingLinkAction(null);
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Guardians"
          title="Guardians"
          description="Manage guardian records and student links for your transportation account."
        />

        {writeError && (
          <Card className="border-danger-200 bg-danger-50 p-4" role="alert">
            <p className="text-sm font-semibold text-danger-700">{writeError}</p>
          </Card>
        )}
        {successMessage && (
          <Card className="border-success-200 bg-success-50 p-4" role="status">
            <p className="text-sm font-semibold text-success-700">{successMessage}</p>
          </Card>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="guardian-search">
            Search guardians
          </label>
          <input
            id="guardian-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, phone, or status"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {loading && (
          <DataState title="Loading guardians" message="Fetching guardian records visible to you." />
        )}
        {error && <DataState title="Unable to load guardians" message={error} />}
        {!loading && !error && guardians.length === 0 && (
          <DataState
            title="No guardians visible"
            message="No guardian records are available for this account."
          />
        )}
        {!loading && !error && guardians.length > 0 && filteredGuardians.length === 0 && (
          <DataState
            title="No guardians match"
            message="Try a different name, email, phone, or status search."
          />
        )}

        {!loading && !error && filteredGuardians.length > 0 && (
          <section className="grid gap-4">
            {filteredGuardians.map((guardian) => {
              const guardianLinks = linksByGuardian.get(guardian.id) ?? [];
              const activeLinks = guardianLinks.filter((l) => l.status === 'active');
              const inactiveLinks = guardianLinks.filter((l) => l.status !== 'active');
              const alreadyLinkedIds = linkedStudentIdsForGuardian(guardian.id);
              const eligibleStudents = students.filter((s) => !alreadyLinkedIds.has(s.id) && s.status === 'active');
              const isExpanded = expandedGuardianId === guardian.id;
              const isLinking = linkingGuardianId === guardian.id;

              return (
                <Card key={guardian.id} className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-navy-900">{guardian.full_name}</h2>
                      <p className="mt-1 text-sm text-gray-600">{guardian.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusPill tone={guardianStatusTone[guardian.status]}>
                        {guardian.status}
                      </StatusPill>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setExpandedGuardianId(isExpanded ? null : guardian.id)}
                      >
                        {isExpanded ? 'Hide links' : `View links (${activeLinks.length})`}
                      </Button>
                      {canWrite && guardian.status === 'active' && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setLinkingGuardianId(isLinking ? null : guardian.id);
                            setLinkStudentId('');
                            setLinkRelationship('guardian');
                            setWriteError(null);
                            setSuccessMessage(null);
                          }}
                        >
                          {isLinking ? 'Cancel' : 'Add link'}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                    <p className="text-gray-600">
                      Phone: <span className="font-semibold text-navy-900">{guardian.phone ?? 'Not assigned'}</span>
                    </p>
                    <p className="text-gray-600">
                      Active links: <span className="font-semibold text-navy-900">{activeLinks.length}</span>
                    </p>
                    <p className="text-gray-600">
                      Profile: <span className="font-semibold text-navy-900">{profileLabels.get(guardian.profile_id) ?? 'Not found'}</span>
                    </p>
                    <p className="text-gray-600">
                      Created: <span className="font-semibold text-navy-900">{formatDate(guardian.created_at)}</span>
                    </p>
                  </div>

                  {/* Add link form (inline) */}
                  {canWrite && isLinking && guardian.status === 'active' && (
                    <div className="mt-4 border-t border-gray-200 pt-4">
                      <h3 className="text-sm font-bold text-navy-900">Link a student to {guardian.full_name}</h3>
                      {eligibleStudents.length === 0 ? (
                        <p className="mt-2 text-sm text-gray-600">
                          All active students are already linked to this guardian.
                        </p>
                      ) : (
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <label className="block text-sm font-semibold text-gray-700" htmlFor={`link-student-${guardian.id}`}>
                            Student
                            <select
                              id={`link-student-${guardian.id}`}
                              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
                              value={linkStudentId}
                              onChange={(event) => setLinkStudentId(event.target.value)}
                            >
                              <option value="">Select a student</option>
                              {eligibleStudents.map((student) => (
                                <option key={student.id} value={student.id}>
                                  {studentDisplayName(student)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-sm font-semibold text-gray-700" htmlFor={`link-rel-${guardian.id}`}>
                            Relationship
                            <select
                              id={`link-rel-${guardian.id}`}
                              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
                              value={linkRelationship}
                              onChange={(event) => setLinkRelationship(event.target.value)}
                            >
                              <option value="guardian">Guardian</option>
                              <option value="mother">Mother</option>
                              <option value="father">Father</option>
                              <option value="caregiver">Caregiver</option>
                              <option value="other">Other</option>
                            </select>
                          </label>
                        </div>
                      )}
                      {eligibleStudents.length > 0 && (
                        <div className="mt-3">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleCreateLink(guardian.id)}
                            disabled={pendingLinkAction === guardian.id || !linkStudentId}
                          >
                            {pendingLinkAction === guardian.id ? 'Saving…' : 'Save link'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Linked students (expandable) */}
                  {isExpanded && (
                    <div className="mt-4 border-t border-gray-200 pt-4">
                      <h3 className="text-sm font-bold text-navy-900">Linked students</h3>
                      {activeLinks.length === 0 && inactiveLinks.length === 0 && (
                        <p className="mt-2 text-sm text-gray-600">No students linked to this guardian.</p>
                      )}
                      <div className="mt-2 divide-y divide-gray-100">
                        {activeLinks.map((link) => {
                          const student = studentMap.get(link.student_id);
                          return (
                            <div key={link.id} className="flex items-center justify-between gap-4 py-3">
                              <div>
                                <p className="font-semibold text-navy-900">
                                  {student ? studentDisplayName(student) : 'Unknown student'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Relationship: {link.relationship}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <StatusPill tone="success">active</StatusPill>
                                {canWrite && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={pendingLinkAction === link.id}
                                    onClick={() => void handleDeactivateLink(link.id, guardian.full_name)}
                                  >
                                    {pendingLinkAction === link.id ? 'Deactivating…' : 'Deactivate link'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {inactiveLinks.length > 0 && (
                          <div className="py-2">
                            <p className="text-xs font-semibold text-gray-500">Inactive links ({inactiveLinks.length})</p>
                            {inactiveLinks.map((link) => {
                              const student = studentMap.get(link.student_id);
                              return (
                                <div key={link.id} className="flex items-center justify-between gap-4 py-2">
                                  <p className="text-sm text-gray-500">
                                    {student ? studentDisplayName(student) : 'Unknown student'}
                                  </p>
                                  <StatusPill tone="neutral">{link.status}</StatusPill>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
