import { useEffect, useMemo, useState } from 'react';
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

export function AdminGuardiansPage() {
  const { profile } = useAuth();
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [links, setLinks] = useState<StudentGuardian[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state for linking.
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkGuardianId, setLinkGuardianId] = useState('');
  const [linkRelationship, setLinkRelationship] = useState('guardian');

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  async function reload() {
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
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleCreateLink() {
    setWriteError(null);
    setSuccessMessage(null);
    if (!linkStudentId || !linkGuardianId) {
      setWriteError('Student and guardian are required.');
      return;
    }
    try {
      await createStudentGuardianLink({
        studentId: linkStudentId,
        guardianId: linkGuardianId,
        relationship: linkRelationship,
        defaultTenantId: profile?.tenant_id ?? null,
      });
      setShowLinkForm(false);
      setLinkStudentId('');
      setLinkGuardianId('');
      setLinkRelationship('guardian');
      setSuccessMessage('Student guardian link created.');
      await reload();
    } catch (createError) {
      setWriteError(createError instanceof Error ? createError.message : 'Unable to create link.');
    }
  }

  async function handleDeactivateLink(linkId: string) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await deactivateStudentGuardianLink(linkId);
      setSuccessMessage('Link deactivated.');
      await reload();
    } catch (deactivateError) {
      setWriteError(deactivateError instanceof Error ? deactivateError.message : 'Unable to deactivate link.');
    }
  }

  const profileLabels = useMemo(() => {
    return new Map(
      profiles.map((profile) => [profile.id, `${profile.full_name} (${profile.email})`]),
    );
  }, [profiles]);

  const linkedStudentCounts = useMemo(() => {
    return links.reduce((counts, link) => {
      if (link.status !== 'active') return counts;
      counts.set(link.guardian_id, (counts.get(link.guardian_id) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
  }, [links]);

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

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Guardians"
          title="Visible guardian records"
          description="Read-only guardian records returned by Supabase under the current admin user's RLS permissions."
        />

        {canWrite && (
          <div className="flex">
            <Button type="button" onClick={() => {
              setShowLinkForm(!showLinkForm);
              setWriteError(null);
              setSuccessMessage(null);
            }}>
              {showLinkForm ? 'Cancel' : 'Link student to guardian'}
            </Button>
          </div>
        )}

        {writeError && (
          <Card className="border-danger-200 bg-danger-50 p-4">
            <p className="text-sm font-semibold text-danger-700">{writeError}</p>
          </Card>
        )}
        {successMessage && (
          <Card className="border-success-200 bg-success-50 p-4">
            <p className="text-sm font-semibold text-success-700">{successMessage}</p>
          </Card>
        )}

        {canWrite && showLinkForm && (
          <Card className="p-5">
            <h2 className="text-lg font-bold text-navy-900">Link student to guardian</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="block text-sm font-semibold text-gray-700" htmlFor="link-student-select">
                Student
                <select
                  id="link-student-select"
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
                  value={linkStudentId}
                  onChange={(event) => setLinkStudentId(event.target.value)}
                >
                  <option value="">Select a student</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.first_name} {student.last_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-gray-700" htmlFor="link-guardian-select">
                Guardian
                <select
                  id="link-guardian-select"
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
                  value={linkGuardianId}
                  onChange={(event) => setLinkGuardianId(event.target.value)}
                >
                  <option value="">Select a guardian</option>
                  {guardians.map((guardian) => (
                    <option key={guardian.id} value={guardian.id}>
                      {guardian.full_name} ({guardian.email})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-gray-700" htmlFor="link-relationship-select">
                Relationship
                <select
                  id="link-relationship-select"
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
            <div className="mt-4">
              <Button type="button" onClick={() => void handleCreateLink()}>
                Save link
              </Button>
            </div>
          </Card>
        )}

        {links.length > 0 && (
          <Card className="overflow-hidden">
            <div className="border-b border-gray-200 p-5">
              <h2 className="text-xl font-bold text-navy-900">Student-guardian links</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {links.map((link) => {
                const student = students.find((s) => s.id === link.student_id);
                const guardian = guardians.find((g) => g.id === link.guardian_id);
                return (
                  <div key={link.id} className="flex items-center justify-between gap-4 p-5">
                    <div>
                      <p className="font-bold text-navy-900">
                        {student ? `${student.first_name} ${student.last_name}` : link.student_id}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        Guardian: {guardian?.full_name ?? link.guardian_id} &middot; {link.relationship}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusPill tone={link.status === 'active' ? 'success' : 'neutral'}>
                        {link.status}
                      </StatusPill>
                      {canWrite && link.status === 'active' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleDeactivateLink(link.id)}
                        >
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
          <DataState
            title="Loading guardians"
            message="Fetching guardian records visible to you."
          />
        )}
        {error && <DataState title="Unable to load guardians" message={error} />}
        {!loading && !error && guardians.length === 0 && (
          <DataState
            title="No guardians visible"
            message="No guardian records are available for this account under the current RLS policies."
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
            {filteredGuardians.map((guardian) => (
              <Card key={guardian.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">{guardian.full_name}</h2>
                    <p className="mt-1 text-sm text-gray-600">{guardian.email}</p>
                  </div>
                  <StatusPill tone={guardianStatusTone[guardian.status]}>
                    {guardian.status}
                  </StatusPill>
                </div>
                <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                  <p className="text-gray-600">
                    Phone:{' '}
                    <span className="font-semibold text-navy-900">
                      {guardian.phone ?? 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Linked students:{' '}
                    <span className="font-semibold text-navy-900">
                      {linkedStudentCounts.get(guardian.id) ?? 0}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Profile:{' '}
                    <span className="font-semibold text-navy-900">
                      {profileLabels.get(guardian.profile_id) ?? guardian.profile_id}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Created:{' '}
                    <span className="font-semibold text-navy-900">
                      {formatDate(guardian.created_at)}
                    </span>
                  </p>
                </div>
              </Card>
            ))}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
