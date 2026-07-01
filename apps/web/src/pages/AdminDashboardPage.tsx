import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlaceholderCard } from '@/components/ui/PlaceholderCard';
import { StatCard } from '@/components/ui/StatCard';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  adminMetrics,
  mockAlerts,
  mockTrips,
  type GpsStatus,
  type TripStatus,
} from '@/data/mockData';

const tripTone: Record<TripStatus, 'success' | 'warning' | 'neutral' | 'info'> = {
  active: 'success',
  delayed: 'warning',
  scheduled: 'neutral',
  completed: 'info',
};

const gpsTone: Record<GpsStatus, 'success' | 'warning' | 'danger'> = {
  live: 'success',
  stale: 'warning',
  offline: 'danger',
};

export function AdminDashboardPage() {
  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Overview"
          title="Transportation operations"
          description="Mock operational summary for active school bus trips, alerts, GPS status, and confirmation events."
        />
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Active trips"
            value={adminMetrics.activeTrips}
            detail="Currently running"
          />
          <StatCard
            label="Delayed buses"
            value={adminMetrics.delayedBuses}
            detail="Need attention"
          />
          <StatCard
            label="GPS stale/offline"
            value={adminMetrics.staleGpsBuses}
            detail="Location placeholders only"
          />
          <StatCard
            label="Students picked up"
            value={adminMetrics.studentsPickedUp}
            detail="Mock confirmations"
          />
          <StatCard
            label="Students dropped off"
            value={adminMetrics.studentsDroppedOff}
            detail="Mock confirmations"
          />
          <StatCard
            label="Manual overrides"
            value={adminMetrics.manualOverrides}
            detail="Recorded by staff"
          />
        </section>
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-gray-200 p-5">
              <h2 className="text-xl font-bold text-navy-900">Live trips</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {mockTrips.map((trip) => (
                <div
                  key={trip.id}
                  className="grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div>
                    <p className="font-bold text-navy-900">
                      Bus {trip.bus.busNumber} - {trip.route.name}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {trip.driverName} | {trip.pickedUp}/{trip.totalStudents} picked up | Updated{' '}
                      {trip.lastUpdated}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone={tripTone[trip.status]}>{trip.status}</StatusPill>
                    <StatusPill tone={gpsTone[trip.gpsStatus]}>{trip.gpsStatus}</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b border-gray-200 p-5">
              <h2 className="text-xl font-bold text-navy-900">Alerts</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {mockAlerts.map((alert) => (
                <div key={alert.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-navy-900">{alert.message}</p>
                    <StatusPill tone={alert.severity === 'info' ? 'info' : 'warning'}>
                      {alert.severity}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {alert.routeName} {alert.busNumber ? `| Bus ${alert.busNumber}` : ''} |{' '}
                    {alert.createdAt}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </section>
        <PlaceholderCard
          title="Live map placeholder"
          description="A map provider and real GPS tracking are intentionally out of scope for Milestone 1."
        />
      </div>
    </DashboardLayout>
  );
}
