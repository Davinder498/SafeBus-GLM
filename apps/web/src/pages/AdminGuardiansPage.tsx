import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { getVisibleProfiles } from '@/services/adminOrganizationService';
import {
  getVisibleGuardians,
  getVisibleStudentGuardianLinks,
} from '@/services/studentGuardianService';
import type { OrganizationProfile } from '@/types/organization';
import type { Guardian, GuardianStatus, StudentGuardian } from '@/types/studentGuardian';

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
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [links, setLinks] = useState<StudentGuardian[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadGuardians() {
      setLoading(true);
      setError(null);

      try {
        const [nextGuardians, nextProfiles, nextLinks] = await Promise.all([
          getVisibleGuardians(),
          getVisibleProfiles(),
          getVisibleStudentGuardianLinks(),
        ]);

        if (active) {
          setGuardians(nextGuardians);
          setProfiles(nextProfiles);
          setLinks(nextLinks);
        }
      } catch (guardiansError) {
        if (active) {
          setError(
            guardiansError instanceof Error ? guardiansError.message : 'Unable to load guardians.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadGuardians();

    return () => {
      active = false;
    };
  }, []);

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

        <Card className="border-navy-100 bg-navy-50 p-5">
          <p className="text-sm font-semibold text-navy-900">
            Guardian creation and student linking will be handled through secure admin workflows in
            a later milestone.
          </p>
        </Card>

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
