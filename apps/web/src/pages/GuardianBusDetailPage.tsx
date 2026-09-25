import { useCallback } from 'react';
import { useVerifiedGuardianData } from '@/hooks/useVerifiedGuardianData';
import { ArrowLeft, BusFront, MapPin, Navigation, Users } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { DashboardLayout, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  fetchGuardianBusServiceLines,
  fetchGuardianBusVisibility,
} from '@/services/guardianLiveBusLocationService';
import type {
  GuardianBusServiceLine,
  GuardianBusServiceStop,
  GuardianBusVisibility,
} from '@/types/guardianLiveBusLocation';
import {
  groupGuardianBuses,
  guardianBusStatus,
  type GuardianBusGroup,
} from '@/utils/guardianBusGroups';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatGrade(grade: string): string {
  return /^grade\s/i.test(grade) ? grade : `Grade ${grade}`;
}

function studentStatus(student: GuardianBusVisibility): string {
  if (student.studentTripStatus === 'picked_up') return 'On board';
  if (student.studentTripStatus === 'dropped_off') return 'Drop-off complete';
  if (student.studentTripStatus === 'not_picked_up') return 'Waiting for pickup';
  return 'Service not started';
}

function serviceLineStatus(line: GuardianBusServiceLine): {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
} {
  if (line.tripStatus === 'paused') {
    return { label: 'Paused', tone: 'warning' };
  }
  if (line.locationState === 'fresh') {
    return { label: 'Live', tone: 'success' };
  }
  if (line.locationState === 'stale') {
    return { label: 'Delayed', tone: 'warning' };
  }
  if (line.tripStatus === 'active') {
    return { label: 'Waiting', tone: 'neutral' };
  }
  return { label: 'Inactive', tone: 'neutral' };
}

export function GuardianBusDetailPage() {
  const { busNumber: encodedBusNumber } = useParams();
  const busNumber = encodedBusNumber ? decodeURIComponent(encodedBusNumber) : '';
  const fetchDetails = useCallback(
    async (signal: AbortSignal) => {
      const [visibility, serviceLines] = await Promise.all([
        fetchGuardianBusVisibility(signal),
        fetchGuardianBusServiceLines(busNumber, signal).catch(() => null),
      ]);
      const group = groupGuardianBuses(visibility).find(
        (candidate) =>
          candidate.busNumber?.trim().toLocaleLowerCase() === busNumber.trim().toLocaleLowerCase(),
      );
      return { group, serviceLines };
    },
    [busNumber],
  );
  const { state: verified } = useVerifiedGuardianData(fetchDetails, busNumber);
  const state =
    verified.kind === 'ready'
      ? verified.data.group
        ? {
            kind: 'ready' as const,
            group: verified.data.group,
            serviceLines: verified.data.serviceLines,
          }
        : { kind: 'not-found' as const }
      : verified;

  return (
    <DashboardLayout
      title="Parent Dashboard"
      portal="parent"
      navItems={[]}
      navGroups={guardianNavGroups}
    >
      <div className="mx-auto max-w-3xl space-y-5" data-ui="guardian-bus-detail-page">
        <Link
          to="/guardian/routes"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl px-2 text-sm font-bold text-navy-700 hover:bg-navy-50"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden /> Back to my buses
        </Link>

        <PageHeader
          eyebrow="Bus details"
          title={busNumber ? `Bus ${busNumber}` : 'Bus details'}
          description="Verified service information for the bus assigned to your linked students."
        />

        {state.kind === 'loading' && (
          <DataState
            title="Loading bus details"
            message="Checking the latest verified bus status."
          />
        )}
        {state.kind === 'error' && (
          <DataState
            title="We could not load this bus."
            message="Please return to My Buses and try again."
          />
        )}
        {state.kind === 'not-found' && (
          <DataState
            title="This bus is not available."
            message="Its assignment may have changed."
          />
        )}

        {state.kind === 'ready' && (
          <BusDetails group={state.group} serviceLines={state.serviceLines} />
        )}
      </div>
    </DashboardLayout>
  );
}

function BusDetails({
  group,
  serviceLines,
}: {
  group: GuardianBusGroup;
  serviceLines: GuardianBusServiceLine[] | null;
}) {
  const busStatus = guardianBusStatus(group);
  const liveMapPath = group.busNumber
    ? `/guardian/live-map?bus=${encodeURIComponent(group.busNumber)}`
    : '/guardian/live-map';

  return (
    <>
      <Card className="overflow-hidden" data-ui="guardian-bus-detail-hero">
        <div className="bg-navy-900 p-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-400 text-navy-900">
                <BusFront className="h-7 w-7" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100">
                  Assigned bus
                </p>
                <h2 className="mt-1 text-4xl font-extrabold tracking-tight">
                  Bus {group.busNumber}
                </h2>
              </div>
            </div>
            <StatusPill tone={busStatus.tone} dot pulse={busStatus.pulse}>
              {busStatus.label}
            </StatusPill>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-3">
              <p className="text-xs font-semibold text-blue-100">License plate</p>
              <p className="mt-1 font-bold">{group.licensePlate ?? 'Not available'}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <p className="text-xs font-semibold text-blue-100">Students</p>
              <p className="mt-1 font-bold">{group.students.length}</p>
            </div>
          </div>
        </div>
      </Card>

      {serviceLines === null && (
        <DataState
          title="Route line is not available"
          message="The bus and live map remain available. Route stops will appear after the guardian route contract is approved and released."
          icon={<Navigation className="h-6 w-6" aria-hidden />}
        />
      )}

      {serviceLines?.length === 0 && (
        <DataState
          title="No current service line"
          message="The assigned route may be changing. Check again when the next school run begins."
          icon={<Navigation className="h-6 w-6" aria-hidden />}
        />
      )}

      {serviceLines?.map((line) => (
        <ServiceLineCard key={`${line.routeName}:${line.tripName}:${line.direction}`} line={line} />
      ))}

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-navy-900">
          <Users className="h-5 w-5 text-navy-700" aria-hidden /> Assigned students
        </h2>
        <ul className="mt-4 divide-y divide-gray-200">
          {group.students.map((student) => (
            <li
              key={student.studentId}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p className="font-bold text-navy-900">{student.studentName}</p>
                {student.studentGrade && (
                  <p className="text-sm text-gray-500">{formatGrade(student.studentGrade)}</p>
                )}
              </div>
              <span className="text-right text-sm font-semibold text-gray-600">
                {studentStatus(student)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Link
        to={liveMapPath}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-navy-800 px-5 py-3 font-bold text-white shadow-lg shadow-navy-900/10 hover:bg-navy-900"
      >
        <MapPin className="h-5 w-5" aria-hidden /> See live map
      </Link>
    </>
  );
}

function formatPlannedTime(time: string | null): string | null {
  if (!time) return null;
  const [hoursText, minutesText] = time.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return time;
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function ServiceLineCard({ line }: { line: GuardianBusServiceLine }) {
  const status = serviceLineStatus(line);
  const progress = line.progressPercent;
  const hasLivePosition = line.locationState === 'fresh' && progress !== null;
  const nextStop = line.stops.find((stop) => stop.serviceState === 'next');
  const atStop = line.stops.find((stop) => stop.serviceState === 'at_stop');
  const announcement = nextStop
    ? `Next stop ${nextStop.name}.${
        nextStop.etaStatus === 'unavailable' ? '' : ` ${nextStop.etaLabel}.`
      }`
    : atStop
      ? `Bus is at ${atStop.name}.`
      : '';

  return (
    <Card className="p-5" data-ui="guardian-service-line-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
            Live service line
          </p>
          <h2 className="mt-1 text-xl font-bold text-navy-900">{line.routeName}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {line.tripName} ·{' '}
            {line.direction === 'reverse' ? 'Return direction' : 'Outbound direction'}
          </p>
        </div>
        <StatusPill tone={status.tone} dot pulse={status.label === 'Live'}>
          {status.label}
        </StatusPill>
      </div>

      {line.stops.length > 0 ? (
        <div
          className="mt-6"
          data-ui="guardian-service-line"
          aria-label={`${line.routeName} scheduled stops`}
        >
          <span className="guardian-service-line__track" aria-hidden />
          {hasLivePosition && (
            <span
              className="guardian-service-line__travelled"
              style={{ height: `clamp(0rem, ${progress}%, 100%)` }}
              aria-hidden
            />
          )}
          {hasLivePosition && (
            <span
              className="guardian-service-line__bus"
              style={{ top: `clamp(0.875rem, ${progress}%, calc(100% - 0.875rem))` }}
              aria-hidden
              data-testid="guardian-service-line-bus"
            >
              <BusFront className="h-5 w-5" />
            </span>
          )}

          {line.stops.map((stop, index) => (
            <ServiceStopPoint
              key={`${stop.order}:${stop.name}`}
              stop={stop}
              index={index}
              total={line.stops.length}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-gray-600">
          Scheduled stops are not available for this service yet.
        </div>
      )}

      {hasLivePosition ? (
        <div className="mt-4 rounded-2xl bg-navy-50 p-3 text-sm text-navy-800">
          <p className="font-semibold">
            {line.nextStopName
              ? `Next stop: ${line.nextStopName}`
              : 'Bus is at the end of this run.'}
          </p>
          {line.progressSource === 'stop_sequence' && (
            <p className="mt-1 text-xs text-navy-700">Position estimated from the ordered stops.</p>
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-gray-600">
          Live position appears when the school run is active and a fresh GPS update is available.
        </p>
      )}

      <p className="mt-4 text-xs leading-5 text-gray-500">
        The marker moves only when a verified location update is received. It is never projected
        ahead of the last update.
      </p>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {line.locationRecordedAt && (
        <p className="mt-3 flex items-center gap-2 text-sm text-gray-600">
          <Navigation className="h-4 w-4 text-navy-700" aria-hidden /> Last location update{' '}
          {formatTimestamp(line.locationRecordedAt)}
        </p>
      )}
    </Card>
  );
}

function ServiceStopPoint({
  stop,
  index,
  total,
}: {
  stop: GuardianBusServiceStop;
  index: number;
  total: number;
}) {
  const isStart = index === 0;
  const isEnd = index === total - 1;
  const plannedTime = formatPlannedTime(stop.plannedArrivalTime);
  const positionLabel = isStart ? 'Start' : isEnd ? 'End' : `Stop ${index + 1}`;

  return (
    <div
      className="guardian-service-line__point"
      data-terminal={isStart || isEnd || undefined}
      data-state={stop.serviceState}
    >
      <span aria-hidden />
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-gray-500">
            {stop.serviceState === 'next' ? 'Next stop' : positionLabel}
          </p>
          <p className="mt-0.5 font-bold text-navy-900">{stop.name}</p>
          <p className="mt-1 text-xs text-gray-500">Planned {plannedTime ?? 'time unavailable'}</p>
        </div>
        {stop.etaStatus !== 'unavailable' && (
          <div className="shrink-0 text-right">
            <p className="guardian-service-line__eta text-sm font-extrabold text-navy-800">
              {stop.etaLabel}
            </p>
            {stop.etaMinMinutes !== null && stop.etaMaxMinutes !== null && (
              <p className="mt-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-500">
                Live ETA
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
