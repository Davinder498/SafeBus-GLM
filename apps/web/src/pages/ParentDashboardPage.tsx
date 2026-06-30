import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlaceholderCard } from '@/components/ui/PlaceholderCard';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  mockNotifications,
  mockParentBus,
  mockParentRoute,
  mockParentTrip,
  mockStudent,
  mockTimeline,
} from '@/data/mockData';

export function ParentDashboardPage() {
  return (
    <DashboardLayout title="Parent Dashboard" portal="parent" navItems={['Bus Status']}>
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Assigned bus"
          title={`Bus ${mockParentBus.busNumber}`}
          description="Only the assigned demo student and bus are shown."
        />
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500">Student</p>
              <h2 className="mt-1 text-3xl font-bold text-navy-900">
                {mockStudent.firstName} {mockStudent.lastInitial}
              </h2>
              <p className="mt-2 text-gray-700">
                {mockStudent.grade} | {mockStudent.school}
              </p>
              <p className="mt-2 text-gray-700">{mockParentRoute.name}</p>
            </div>
            <StatusPill tone="success">{mockParentTrip.status}</StatusPill>
          </div>
          <div className="mt-5 grid gap-3 border-t border-gray-200 pt-5 sm:grid-cols-2">
            <p className="text-sm text-gray-600">
              Route status: <span className="font-semibold text-navy-900">On route</span>
            </p>
            <p className="text-sm text-gray-600">
              Last updated:{' '}
              <span className="font-semibold text-navy-900">{mockParentTrip.lastUpdated}</span>
            </p>
            <p className="text-sm text-gray-600">
              Delay status: <span className="font-semibold text-navy-900">No delay reported</span>
            </p>
            <p className="text-sm text-gray-600">
              Assigned bus:{' '}
              <span className="font-semibold text-navy-900">Bus {mockParentBus.busNumber}</span>
            </p>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-bold text-navy-900">Pickup and drop-off timeline</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {mockTimeline.map((event) => (
              <div key={event.id} className="flex gap-4 p-5">
                <div className="pt-1">
                  <span className="block h-3 w-3 rounded-full bg-navy-700" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-bold text-navy-900">{event.label}</p>
                    <StatusPill
                      tone={
                        event.status === 'complete'
                          ? 'success'
                          : event.status === 'current'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {event.time}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{event.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <PlaceholderCard
          title="Map placeholder"
          description="Parent map visibility will show only the assigned bus during active trips in a later milestone."
        />
        <Card className="overflow-hidden">
          <div className="border-b border-gray-200 p-5">
            <h2 className="text-xl font-bold text-navy-900">Notification history</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {mockNotifications.map((notification) => (
              <div key={notification.id} className="p-5">
                <p className="font-bold text-navy-900">{notification.title}</p>
                <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
                <p className="mt-2 text-xs font-semibold text-gray-500">{notification.time}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
