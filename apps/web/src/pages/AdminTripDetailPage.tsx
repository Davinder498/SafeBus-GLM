import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminTripMap } from '@/components/admin/AdminTripMap';
import { TripDispatchStatus } from '@/components/admin/TripDispatchStatus';
import { TripOperationalEvidencePanel } from '@/components/admin/TripOperationalEvidencePanel';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataState } from '@/components/ui/DataState';
import { StatusPill } from '@/components/ui/StatusPill';
import { AdminTripAccessError, fetchAdminTripDetail } from '@/services/adminTripDetailService';
import { directionLabel } from '@/services/adminTripOverviewService';
import {
  getAdminActiveTripOperationalStatuses,
  type AdminTripOperationalStatus,
} from '@/services/phase6OperationsService';
import { useAdminTripRefresh } from '@/hooks/useAdminTripRefresh';
import type { AdminTripDetail } from '@/types/adminTripDetail';
import {
  ALBERTA_TIME_ZONE,
  formatAdminTripDate,
  formatAdminTripTime,
} from '@/utils/adminTripDates';
import {
  tripLocationLabel,
  tripStopPosition,
  verifiedTripLocation,
} from '@/utils/adminTripPresentation';

const time = (value: string) => formatAdminTripTime(value, ALBERTA_TIME_ZONE);

export function AdminTripDetailPage() {
  const { tripId = '' } = useParams();
  const location = useLocation();
  const from = (location.state as { tripReturnTo?: unknown } | null)?.tripReturnTo;
  const returnTo =
    typeof from === 'string' && /^\/admin(?:\/live-trips|\/live-fleet|\/trips)?(?:\?|$)/.test(from)
      ? from
      : '/admin/trips';
  const [detail, setDetail] = useState<AdminTripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [clock, setClock] = useState(Date.now());
  const [dispatch, setDispatch] = useState<AdminTripOperationalStatus | null>(null);
  const [dispatchError, setDispatchError] = useState(false);
  const sequence = useRef(0);
  const refreshDispatch = useCallback(async () => {
    try {
      const statuses = await getAdminActiveTripOperationalStatuses();
      setDispatch(statuses.find((s) => s.trip_id === tripId) ?? null);
      setDispatchError(false);
    } catch {
      setDispatch(null);
      setDispatchError(true);
    }
  }, [tripId]);
  const load = useCallback(
    async (background = false) => {
      const request = ++sequence.current;
      if (!background) setLoading(true);
      try {
        const next = await fetchAdminTripDetail(tripId);
        if (request !== sequence.current) return;
        setDetail(next);
        setError(null);
        setCheckedAt(Date.now());
        setClock(Date.now());
        if (next && ['active', 'paused'].includes(next.trip.status)) void refreshDispatch();
        else setDispatch(null);
      } catch (cause) {
        if (request === sequence.current) {
          setError(cause instanceof Error ? cause.message : 'Could not load trip details.');
          // Cached telemetry is no longer verified after a failed refresh.
          setCheckedAt(0);
          if (cause instanceof AdminTripAccessError) {
            setDetail(null);
            setDispatch(null);
          }
        }
      } finally {
        if (request === sequence.current) setLoading(false);
      }
    },
    [tripId, refreshDispatch],
  );
  useEffect(() => {
    setDetail(null);
    setDispatch(null);
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);
  useAdminTripRefresh(
    () => {
      if (!detail || ['active', 'paused'].includes(detail.trip.status)) void load(true);
    },
    () => setCheckedAt(0),
  );
  useEffect(() => {
    const sync = () => {
      setOnline(navigator.onLine);
      setClock(Date.now());
    };
    const interval = window.setInterval(sync, 5_000);
    window.addEventListener('offline', sync);
    window.addEventListener('online', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('offline', sync);
      window.removeEventListener('online', sync);
    };
  }, []);
  const verified = detail ? verifiedTripLocation(detail, checkedAt, online, clock) : null;
  const position = detail ? tripStopPosition(detail, verified) : null;
  const ongoing = detail && ['active', 'paused'].includes(detail.trip.status);

  return (
    <DashboardLayout title="Trip details" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-5" data-testid="admin-trip-detail">
        <Link
          to={returnTo}
          className="inline-flex min-h-11 items-center font-semibold text-navy-700 underline"
        >
          Back to trips
        </Link>
        <PageHeader
          eyebrow="Operations"
          title="Trip details"
          action={
            <Button variant="secondary" disabled={loading} onClick={() => void load(true)}>
              Refresh
            </Button>
          }
        />
        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 p-4 font-semibold text-danger-700">
            {error}
          </p>
        )}
        {loading && !detail ? (
          <DataState title="Loading trip" message="Loading trip details." />
        ) : !detail ? (
          !error && (
            <DataState
              title="Trip unavailable"
              message="This trip was not found within your permitted school authority and school scope."
            />
          )
        ) : (
          <>
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-navy-900">{detail.trip.routeName}</h2>
                <StatusPill tone={detail.trip.status === 'active' ? 'success' : 'neutral'}>
                  {detail.trip.status}
                </StatusPill>
              </div>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Route', detail.trip.routeCode],
                  [
                    'Trip',
                    `${detail.trip.tripPatternName} · ${directionLabel(detail.trip.direction)}`,
                  ],
                  ['Bus', detail.trip.busLabel],
                  ['Driver', detail.trip.driverLabel],
                  ['Service date', formatAdminTripDate(detail.trip.serviceDate)],
                  ['ETA', verified ? (detail.eta?.label ?? 'Unavailable') : 'Unavailable'],
                  ['Next stop', verified ? (detail.eta?.nextStop ?? 'Unavailable') : 'Unavailable'],
                  ['Start', time(detail.trip.startedAt)],
                  [
                    'End',
                    detail.trip.endedAt
                      ? time(detail.trip.endedAt)
                      : ongoing
                        ? 'In progress'
                        : 'Not recorded',
                  ],
                  [
                    'Location',
                    !online
                      ? 'Offline'
                      : ongoing
                        ? verified
                          ? 'Live'
                          : tripLocationLabel(
                              detail.location?.state === 'live'
                                ? 'invalid'
                                : (detail.location?.state ?? 'missing'),
                            )
                        : 'Trip ended',
                  ],
                  ...(ongoing
                    ? [
                        [
                          'Last GPS update',
                          detail.location
                            ? new Date(detail.location.recordedAt).toLocaleString(undefined, {
                                timeZone: ALBERTA_TIME_ZONE,
                              })
                            : 'Not recorded',
                        ],
                        [
                          'Speed',
                          verified?.speedMps !== null && verified?.speedMps !== undefined
                            ? `${Math.round(verified.speedMps * 3.6)} km/h`
                            : 'Unavailable',
                        ],
                      ]
                    : []),
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm font-semibold text-gray-600">{label}</dt>
                    <dd className="mt-1 font-semibold text-navy-900">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-gray-500">Alberta time</p>
            </Card>
            {ongoing && (
              <Card className="p-5">
                <h2 className="text-lg font-bold text-navy-900">Operational status</h2>
                {dispatch ? (
                  <TripDispatchStatus
                    key={`${dispatch.trip_id}:${dispatch.operational_status}:${dispatch.reason_code}`}
                    trip={dispatch}
                    onUpdated={refreshDispatch}
                  />
                ) : (
                  <p
                    className="mt-3 text-sm text-gray-600"
                    role={dispatchError ? 'alert' : 'status'}
                  >
                    {dispatchError
                      ? 'Could not load operational status. Refresh to try again.'
                      : 'Operational status is unavailable.'}
                  </p>
                )}
              </Card>
            )}
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(18rem,1fr)_minmax(0,2fr)]">
              <Card className="p-5">
                <h2 className="text-lg font-bold text-navy-900">Service line</h2>
                <p className="mt-2 text-xs text-gray-600">
                  Available route stops and schedule; historical stop snapshots were not saved.
                  {position !== null ? ' Bus progress is estimated from GPS.' : ''}
                </p>
                {detail.stops.length ? (
                  <ol className="mt-5 space-y-0" aria-label="Stops in travel order">
                    {detail.stops.map((stop, index) => (
                      <li
                        key={stop.id}
                        className="relative border-l-2 border-navy-200 pb-6 pl-5 last:pb-0"
                      >
                        <span
                          aria-hidden
                          className={`absolute -left-2 top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${position !== null && position >= index ? 'bg-blue-600' : 'bg-slate-400'}`}
                        />
                        <p className="font-semibold text-navy-900">
                          {index + 1}. {stop.name}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          {stop.plannedTime ? stop.plannedTime.slice(0, 5) : 'Time not recorded'}
                        </p>
                        {position !== null && Math.floor(position) === index && (
                          <p className="mt-1 text-sm font-semibold text-navy-700">
                            {index === detail.stops.length - 1
                              ? 'Bus near final stop'
                              : `Bus toward ${detail.stops[index + 1].name}`}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-4 text-gray-600">Stops are unavailable.</p>
                )}
              </Card>
              <AdminTripMap detail={detail} location={verified} />
            </div>
            <Card className="overflow-hidden p-5">
              <h2 className="text-lg font-bold text-navy-900">
                Students ({detail.students.length})
              </h2>
              <p className="mt-2 text-xs text-gray-600">
                Service-date assignments are available records, not a frozen trip roster. Only
                recorded pickup/drop-off events establish travel.
              </p>
              {detail.students.length ? (
                <div
                  className="mt-4 overflow-x-auto"
                  tabIndex={0}
                  role="region"
                  aria-label="Trip students"
                >
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr>
                        {[
                          'Student',
                          'School',
                          'Pickup stop',
                          'Drop-off stop',
                          'Seat',
                          'Assignment',
                          'Pickup',
                          'Drop-off',
                          'Recorded status',
                        ].map((h) => (
                          <th scope="col" className="px-3 py-3" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.students.map((s) => (
                        <tr className="border-t border-gray-100" key={s.id}>
                          {[
                            s.name,
                            s.school ?? 'Unavailable',
                            s.pickupStop ?? 'Not recorded',
                            s.dropoffStop ?? 'Not recorded',
                            s.seat ?? 'Unassigned',
                            s.hasAssignment
                              ? (s.assignmentStatus ?? 'Assigned')
                              : 'Recorded events only',
                            s.pickedUpAt ? time(s.pickedUpAt) : 'Not recorded',
                            s.droppedOffAt ? time(s.droppedOffAt) : 'Not recorded',
                            s.droppedOffAt
                              ? 'Dropped off'
                              : s.pickedUpAt
                                ? 'Picked up'
                                : 'No events recorded',
                          ].map((value, index) => (
                            <td className="px-3 py-3" key={index}>
                              {value}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-sm text-gray-600">
                  No available assignments or recorded student events.
                </p>
              )}
            </Card>
            <TripOperationalEvidencePanel
              key={tripId}
              tripId={tripId}
              timeZone={ALBERTA_TIME_ZONE}
            />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
