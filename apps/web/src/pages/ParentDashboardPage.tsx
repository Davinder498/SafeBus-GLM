import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
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
import { getMyLinkedStudents } from '@/services/studentGuardianService';
import type { Student } from '@/types/studentGuardian';

function getStudentDisplayName(student: Student) {
  return student.preferred_name
    ? `${student.first_name} ${student.last_name} (${student.preferred_name})`
    : `${student.first_name} ${student.last_name}`;
}

const guardianNavItems = [
  { label: 'Bus Status', to: '/guardian/live' },
  { label: 'Pickup & Drop-off', to: '/guardian/events' },
  { label: 'My Students & Routes', to: '/guardian/routes' },
];

export function ParentDashboardPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadLinkedStudents() {
      setLoadingStudents(true);
      setStudentsError(null);

      try {
        const nextStudents = await getMyLinkedStudents();
        if (active) setStudents(nextStudents);
      } catch (studentError) {
        if (active) {
          setStudentsError(
            studentError instanceof Error
              ? studentError.message
              : 'Unable to load linked students.',
          );
        }
      } finally {
        if (active) setLoadingStudents(false);
      }
    }

    void loadLinkedStudents();

    return () => {
      active = false;
    };
  }, []);

  const primaryStudent = students[0];
  const linkedStudentLabel = primaryStudent
    ? getStudentDisplayName(primaryStudent)
    : `${mockStudent.firstName} ${mockStudent.lastInitial}`;

  return (
    <DashboardLayout title="Parent Dashboard" portal="parent" navItems={guardianNavItems}>
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Assigned bus"
          title={`Bus ${mockParentBus.busNumber}`}
          description="Student visibility is limited by guardian RLS. Bus and trip details remain demo placeholders."
        />
        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-navy-900">My Students & Routes</h2>
              <p className="mt-1 text-sm text-gray-600">
                View your linked students and their assigned route information.
              </p>
            </div>
            <Link
              to="/guardian/routes"
              className="inline-flex rounded-lg bg-navy-700 px-5 py-3 font-bold text-white hover:bg-navy-800"
            >
              View my students
            </Link>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-navy-900">Live Bus Status</h2>
              <p className="mt-1 text-sm text-gray-600">
                See safe, up-to-date trip status for your linked students.
              </p>
            </div>
            <Link
              to="/guardian/live"
              className="inline-flex rounded-lg bg-navy-700 px-5 py-3 font-bold text-white hover:bg-navy-800"
            >
              View live bus status
            </Link>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-navy-900">Pickup & Drop-off Status</h2>
              <p className="mt-1 text-sm text-gray-600">
                Check the latest pickup and drop-off status for your linked students.
              </p>
            </div>
            <Link
              to="/guardian/events"
              className="inline-flex rounded-lg bg-navy-700 px-5 py-3 font-bold text-white hover:bg-navy-800"
            >
              View pickup status
            </Link>
          </div>
        </Card>
        {loadingStudents && (
          <DataState
            title="Loading linked students"
            message="Fetching student records linked to your guardian profile."
          />
        )}
        {studentsError && (
          <DataState title="Unable to load linked students" message={studentsError} />
        )}
        {!loadingStudents && !studentsError && students.length === 0 && (
          <DataState
            title="No linked students visible"
            message="No student records are linked to this guardian account yet."
          />
        )}
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500">Student</p>
              <h2 className="mt-1 text-3xl font-bold text-navy-900">{linkedStudentLabel}</h2>
              <p className="mt-2 text-gray-700">
                {primaryStudent?.grade ?? mockStudent.grade} | {mockStudent.school}
              </p>
              {students.length > 1 && (
                <p className="mt-2 text-sm text-gray-600">
                  {students.length - 1} more linked student
                  {students.length - 1 === 1 ? '' : 's'} visible to this account.
                </p>
              )}
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
