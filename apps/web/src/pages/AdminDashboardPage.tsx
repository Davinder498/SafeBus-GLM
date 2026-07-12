import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { AdminTaskCard } from '@/components/admin/AdminTaskCard';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { fetchAdminLiveTrips } from '@/services/adminLiveMonitoringService';
import { fetchAdminSetupSnapshot, type AdminSetupSnapshot } from '@/services/adminSetupService';

const keys: Array<keyof AdminSetupSnapshot> = ['buses', 'drivers', 'routes', 'students', 'guardians', 'guardianLinks', 'studentAssignments', 'driverAssignments'];
export function AdminDashboardPage() {
  const [setup, setSetup] = useState<AdminSetupSnapshot | null>(null);
  const [activeTrips, setActiveTrips] = useState<number | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void Promise.all([fetchAdminSetupSnapshot(), fetchAdminLiveTrips()]).then(([nextSetup, trips]) => { setSetup(nextSetup); setActiveTrips(trips.length); }).catch(() => setError(true)); }, []);
  const complete = useMemo(() => setup ? keys.filter((key) => key === 'routes' ? setup.routes > 0 && setup.stops > 0 : setup[key] > 0).length : 0, [setup]);
  const next = setup ? [['Add a bus', setup.buses, '/admin/buses'], ['Connect a driver', setup.drivers, '/admin/drivers'], [setup.routes === 0 ? 'Create a route' : 'Add stops to your route', setup.routes > 0 && setup.stops > 0 ? 1 : 0, '/admin/routes'], ['Add students', setup.students, '/admin/students'], ['Add guardians', setup.guardians, '/admin/guardians'], ['Link guardians and students', setup.guardianLinks, '/admin/guardians'], ['Assign student stops', setup.studentAssignments, '/admin/assignments'], ['Assign a driver and bus', setup.driverAssignments, '/admin/driver-assignments']].find(([, count]) => count === 0) : null;
  return <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}><div className="space-y-6"><PageHeader eyebrow="Overview" title="Transportation overview" description="See what is ready, what is missing, and the next practical action." />
    {error && <DataState title="Overview unavailable" message="Use Setup or Operations to continue working." />}
    {!setup && !error && <DataState title="Loading overview" message="Checking transportation readiness." />}
    {setup && <section className="grid gap-4 sm:grid-cols-2"><Card className="p-5"><p className="text-sm font-semibold text-gray-600">Transportation setup</p><p className="mt-1 text-3xl font-bold text-navy-900">{complete} of {keys.length}</p><p className="mt-2 text-sm text-gray-600">{next ? `Next recommended action: ${next[0]}` : 'Core setup is complete.'}</p>{next && <a className="mt-4 inline-flex font-semibold text-navy-700 underline" href={String(next[2])}>Continue setup</a>}</Card><Card className="p-5"><p className="text-sm font-semibold text-gray-600">Active trips</p><p className="mt-1 text-3xl font-bold text-navy-900">{activeTrips ?? 0}</p><p className="mt-2 text-sm text-gray-600">Driver-started trips currently operating.</p></Card></section>}
    <section className="grid gap-4 md:grid-cols-3"><AdminTaskCard title="Finish setup" description="Follow the guided checklist and resolve missing prerequisites." to="/admin/setup" action="Open setup" /><AdminTaskCard title="Operate today's trips" description="Review readiness, active trips, and recently completed trips." to="/admin/operations" action="Open operations" /><AdminTaskCard title="Handle people" description="Manage students, guardians, drivers, and their transportation connections." to="/admin/people" action="Open people" /></section>
  </div></DashboardLayout>;
}
