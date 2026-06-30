import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { mockDriverTrip } from '@/data/mockData';

export function DriverDashboardPage() {
  const [started, setStarted] = useState(mockDriverTrip.status === 'active');

  return (
    <DashboardLayout title="Driver Dashboard" portal="driver" navItems={['Today']}>
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Today"
          title="Assigned trip"
          description="Simple demo controls for a parked-bus workflow."
        />
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500">
                Bus {mockDriverTrip.bus.busNumber}
              </p>
              <h2 className="mt-1 text-3xl font-bold text-navy-900">{mockDriverTrip.route.name}</h2>
              <p className="mt-2 text-lg text-gray-700">
                {mockDriverTrip.route.direction === 'AM' ? 'Morning' : 'Afternoon'} trip |{' '}
                {mockDriverTrip.scheduledStart}
              </p>
            </div>
            <StatusPill tone={started ? 'success' : 'neutral'}>
              {started ? 'active' : 'ready'}
            </StatusPill>
          </div>
        </Card>
        <section className="grid gap-3">
          <Button size="lg" fullWidth onClick={() => setStarted(true)} disabled={started}>
            Start Trip
          </Button>
          <Button size="lg" fullWidth variant="secondary" disabled>
            Scan Student - Coming later
          </Button>
          <Button size="lg" fullWidth variant="danger">
            Report Delay
          </Button>
          <Button
            size="lg"
            fullWidth
            variant="ghost"
            onClick={() => setStarted(false)}
            disabled={!started}
          >
            End Trip
          </Button>
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <p className="text-sm font-semibold text-gray-500">GPS status</p>
            <p className="mt-2 text-2xl font-bold text-navy-900">Placeholder</p>
            <p className="mt-1 text-sm text-gray-600">Real GPS is out of scope.</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-semibold text-gray-500">Sync status</p>
            <p className="mt-2 text-2xl font-bold text-navy-900">Demo only</p>
            <p className="mt-1 text-sm text-gray-600">No backend connection yet.</p>
          </Card>
        </section>
        <Card className="overflow-hidden">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-bold text-navy-900">Assigned stops</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {mockDriverTrip.route.stops.map((stop) => (
              <div key={stop.id} className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-lg font-bold text-navy-900">{stop.name}</p>
                  <p className="text-sm text-gray-600">{stop.scheduledTime}</p>
                </div>
                <StatusPill
                  tone={
                    stop.status === 'complete'
                      ? 'success'
                      : stop.status === 'current'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {stop.status}
                </StatusPill>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
