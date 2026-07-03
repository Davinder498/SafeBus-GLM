import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import { getVisibleBuses } from '@/services/transportationStructureService';
import type { School } from '@/types/organization';
import type { Bus, BusStatus } from '@/types/transportation';

const busStatusTone: Record<BusStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  maintenance: 'warning',
  inactive: 'neutral',
  retired: 'danger',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function AdminBusesPage() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadBuses() {
      setLoading(true);
      setError(null);

      try {
        const [nextBuses, nextSchools] = await Promise.all([
          getVisibleBuses(),
          getVisibleSchools(),
        ]);

        if (active) {
          setBuses(nextBuses);
          setSchools(nextSchools);
        }
      } catch (busesError) {
        if (active) {
          setError(busesError instanceof Error ? busesError.message : 'Unable to load buses.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadBuses();

    return () => {
      active = false;
    };
  }, []);

  const schoolNames = useMemo(() => {
    return new Map(schools.map((school) => [school.id, school.name]));
  }, [schools]);

  const filteredBuses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return buses;

    return buses.filter((bus) =>
      [
        bus.bus_number,
        bus.license_plate,
        bus.capacity?.toString(),
        bus.status,
        bus.school_id ? (schoolNames.get(bus.school_id) ?? bus.school_id) : 'unassigned',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [buses, query, schoolNames]);

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Buses"
          title="Visible buses"
          description="Read-only bus records returned by Supabase under the current admin user's RLS permissions."
        />

        <Card className="border-navy-100 bg-navy-50 p-5">
          <p className="text-sm font-semibold text-navy-900">
            Bus creation and assignment workflows will be added in a later milestone.
          </p>
        </Card>

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="bus-search">
            Search buses
          </label>
          <input
            id="bus-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by bus number, plate, status, capacity, or school"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {loading && (
          <DataState title="Loading buses" message="Fetching bus records visible to you." />
        )}
        {error && <DataState title="Unable to load buses" message={error} />}
        {!loading && !error && buses.length === 0 && (
          <DataState
            title="No buses visible"
            message="No bus records are available for this account under the current RLS policies."
          />
        )}
        {!loading && !error && buses.length > 0 && filteredBuses.length === 0 && (
          <DataState
            title="No buses match"
            message="Try a different bus, plate, school, or status search."
          />
        )}

        {!loading && !error && filteredBuses.length > 0 && (
          <section className="grid gap-4">
            {filteredBuses.map((bus) => (
              <Card key={bus.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">Bus {bus.bus_number}</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {bus.school_id
                        ? (schoolNames.get(bus.school_id) ?? bus.school_id)
                        : 'No school assigned'}
                    </p>
                  </div>
                  <StatusPill tone={busStatusTone[bus.status]}>{bus.status}</StatusPill>
                </div>
                <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                  <p className="text-gray-600">
                    License plate:{' '}
                    <span className="font-semibold text-navy-900">
                      {bus.license_plate ?? 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Capacity:{' '}
                    <span className="font-semibold text-navy-900">
                      {bus.capacity ?? 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Created:{' '}
                    <span className="font-semibold text-navy-900">
                      {formatDate(bus.created_at)}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Bus id: <span className="font-semibold text-navy-900">{bus.id}</span>
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
