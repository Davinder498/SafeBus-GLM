import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleBadge, getRoleLabel } from '@/components/ui/RoleBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  getVisibleProfiles,
  getVisibleSchools,
  getVisibleTenants,
} from '@/services/adminOrganizationService';
import type { OrganizationProfile, School, Tenant } from '@/types/organization';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function AdminUsersPage() {
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadUsers() {
      setLoading(true);
      setError(null);

      try {
        const [nextProfiles, nextSchools, nextTenants] = await Promise.all([
          getVisibleProfiles(),
          getVisibleSchools(),
          getVisibleTenants(),
        ]);

        if (active) {
          setProfiles(nextProfiles);
          setSchools(nextSchools);
          setTenants(nextTenants);
        }
      } catch (usersError) {
        if (active) {
          setError(usersError instanceof Error ? usersError.message : 'Unable to load users.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadUsers();

    return () => {
      active = false;
    };
  }, []);

  const schoolNames = useMemo(() => {
    return new Map(schools.map((school) => [school.id, school.name]));
  }, [schools]);

  const tenantNames = useMemo(() => {
    return new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  }, [tenants]);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return profiles;

    return profiles.filter((profile) => {
      return [profile.full_name, profile.email, profile.role, getRoleLabel(profile.role)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [profiles, query]);

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Users"
          title="Visible profiles"
          description="Read-only user profiles returned by Supabase under the current admin user's RLS permissions."
        />

        <Card className="border-navy-100 bg-navy-50 p-5">
          <p className="text-sm font-semibold text-navy-900">
            User creation and role changes require secure server-side admin workflows and are not
            enabled in this milestone.
          </p>
        </Card>

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="user-search">
            Search users
          </label>
          <input
            id="user-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, or role"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {loading && (
          <DataState title="Loading users" message="Fetching profiles visible to your account." />
        )}
        {error && <DataState title="Unable to load users" message={error} />}
        {!loading && !error && profiles.length === 0 && (
          <DataState
            title="No profiles visible"
            message="No profile rows are available for this account under the current RLS policies."
          />
        )}
        {!loading && !error && profiles.length > 0 && filteredProfiles.length === 0 && (
          <DataState
            title="No users match"
            message="Try a different name, email, or role search."
          />
        )}

        {!loading && !error && filteredProfiles.length > 0 && (
          <section className="grid gap-4">
            {filteredProfiles.map((profile) => (
              <Card key={profile.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">{profile.full_name}</h2>
                    <p className="mt-1 text-sm text-gray-600">{profile.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <RoleBadge role={profile.role} />
                    <StatusPill>{profile.status}</StatusPill>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                  <p className="text-gray-600">
                    Tenant:{' '}
                    <span className="font-semibold text-navy-900">
                      {profile.tenant_id
                        ? (tenantNames.get(profile.tenant_id) ?? profile.tenant_id)
                        : 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    School:{' '}
                    <span className="font-semibold text-navy-900">
                      {profile.school_id
                        ? (schoolNames.get(profile.school_id) ?? profile.school_id)
                        : 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Created:{' '}
                    <span className="font-semibold text-navy-900">
                      {formatDate(profile.created_at)}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Profile id: <span className="font-semibold text-navy-900">{profile.id}</span>
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
