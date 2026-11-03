import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  BusFront,
  CalendarClock,
  CircleAlert,
  Link2,
  MapPinned,
  PauseCircle,
  RadioTower,
  RefreshCw,
  Route,
  UserRound,
  Users,
} from 'lucide-react';
import { AdminTripSearchSection } from '@/components/admin/AdminTripSearchSection';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchAdminSetupSnapshot, type AdminSetupSnapshot } from '@/services/adminSetupService';
import { fetchAdminTripOperations } from '@/services/adminTripDetailService';
import { albertaToday, ALBERTA_TIME_ZONE } from '@/utils/adminTripDates';
import type { AdminTripOperation } from '@/types/adminTripDetail';

const summaryItems = [
  { label: 'Buses', key: 'buses', to: '/admin/buses', icon: BusFront },
  { label: 'Drivers', key: 'drivers', to: '/admin/drivers', icon: UserRound },
  { label: 'Routes', key: 'routes', to: '/admin/routes', icon: Route },
  { label: 'Students', key: 'students', to: '/admin/students', icon: Users },
  { label: 'Guardians', key: 'guardians', to: '/admin/guardians', icon: UserRound },
  { label: 'Guardian links', key: 'guardianLinks', to: '/admin/guardians', icon: Link2 },
  { label: 'Student bus assignments', key: 'studentAssignments', to: '/admin/students', icon: Link2 },
] as const satisfies ReadonlyArray<{
  label: string;
  key: keyof AdminSetupSnapshot;
  to: string;
  icon: typeof BusFront;
}>;

type SummaryState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; snapshot: AdminSetupSnapshot };

type OperationsState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      activeCount: number;
      pausedCount: number;
      activeRows: AdminTripOperation[];
      pausedRows: AdminTripOperation[];
      checkedAt: Date;
    };

function isGpsAttention(trip: AdminTripOperation) {
  // Even an unexpected not_applicable value on an active trip must not be
  // interpreted as a verified GPS fix.
  return trip.locationStatus !== 'live';
}

function gpsIssueLabel(trip: AdminTripOperation) {
  if (trip.locationStatus === 'stale') return 'GPS update overdue';
  if (trip.locationStatus === 'missing') return 'No GPS location received';
  if (trip.locationStatus === 'not_applicable') return 'Trip location not verified';
  return 'GPS location unavailable';
}

const panelClass =
  'min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6';
const linkFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2';

export function AdminDashboardPage() {
  const [summary, setSummary] = useState<SummaryState>({ kind: 'loading' });
  const [operations, setOperations] = useState<OperationsState>({ kind: 'loading' });
  const sequence = useRef(0);

  const loadDashboard = useCallback(async () => {
    const request = ++sequence.current;
    setSummary({ kind: 'loading' });
    setOperations({ kind: 'loading' });
    const today = albertaToday();
    const baseQuery = { fromDate: today, toDate: today, page: 1, pageSize: 25 as const };
    // Existing authorized, bounded trip RPC. Totals come from its exact result count;
    // GPS issues are only described for the returned rows, never as fleet-wide totals.
    const [summaryResult, activeResult, pausedResult] = await Promise.allSettled([
      fetchAdminSetupSnapshot(),
      fetchAdminTripOperations({ ...baseQuery, status: 'active' }),
      fetchAdminTripOperations({ ...baseQuery, status: 'paused' }),
    ]);
    if (request !== sequence.current) return;
    if (summaryResult.status === 'fulfilled') {
      setSummary({ kind: 'ready', snapshot: summaryResult.value });
    } else {
      setSummary({ kind: 'error' });
    }
    if (activeResult.status === 'fulfilled' && pausedResult.status === 'fulfilled') {
      setOperations({
        kind: 'ready',
        activeCount: activeResult.value.totalCount,
        pausedCount: pausedResult.value.totalCount,
        activeRows: activeResult.value.rows,
        pausedRows: pausedResult.value.rows,
        checkedAt: new Date(),
      });
    } else {
      setOperations({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    return () => { sequence.current += 1; };
  }, [loadDashboard]);

  const gpsRows = operations.kind === 'ready'
    ? operations.activeRows.filter(isGpsAttention)
    : [];
  const attention = operations.kind === 'ready'
    ? [
        ...gpsRows.map((trip) => ({ trip, label: gpsIssueLabel(trip), tone: 'warning' as const })),
        ...operations.pausedRows.map((trip) => ({
          trip,
          label: 'Trip paused',
          tone: 'info' as const,
        })),
      ].slice(0, 4)
    : [];

  const kpis = operations.kind === 'ready'
    ? [
        { label: 'Active trips today', value: operations.activeCount, detail: 'Operating now', icon: BusFront, tone: 'mint', to: '/admin/live-trips?tripMode=today&tripStatus=active' },
        { label: 'Paused trips today', value: operations.pausedCount, detail: 'Require operational review', icon: PauseCircle, tone: 'blue', to: '/admin/live-trips?tripMode=today&tripStatus=paused' },
        { label: 'GPS attention', value: gpsRows.length, detail: 'Among loaded active trips (up to 25)', icon: RadioTower, tone: 'amber', to: '/admin/live-trips?tripMode=today&tripStatus=active' },
      ]
    : [];
  const liveTrips = operations.kind === 'ready' ? operations.activeRows.slice(0, 5) : [];

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6" data-testid="tenant-admin-overview">
        <PageHeader
          eyebrow="Operations"
          title="Transportation overview"
          description="A clear view of today's trip activity, GPS attention, and your authorized transportation records."
          action={
            <Link
              to="/admin/live-trips"
              className={'sb-primary-action inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold ' + linkFocus}
            >
              <MapPinned className="h-4 w-4" aria-hidden />
              Open Live Operations
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />

        <section aria-labelledby="operations-pulse-title" data-testid="admin-operations-pulse" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="operations-pulse-title" className="text-lg font-bold text-[var(--color-text)]">Today's operations</h2>
              <p className="text-xs text-[var(--color-text-muted)]">Alberta time. Refresh to check the current operational snapshot.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadDashboard()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Refresh overview
            </Button>
          </div>
          {operations.kind === 'loading' && (
            <div className={panelClass}><DataState title="Loading today's operations" message="Checking your authorized trips." /></div>
          )}
          {operations.kind === 'error' && (
            <div className={panelClass} role="alert">
              <DataState title="Today's operations unavailable" message="Trip statuses could not be verified. No live counts are shown." />
              <Button variant="secondary" onClick={() => void loadDashboard()}>Retry overview</Button>
            </div>
          )}
          {operations.kind === 'ready' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {kpis.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      className={'group min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-all hover:border-[var(--color-focus)] hover:shadow-md ' + linkFocus}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={'flex h-11 w-11 items-center justify-center rounded-xl ' + (
                          item.tone === 'mint' ? 'bg-[var(--color-success-surface)] text-[var(--color-success-text)]' :
                          item.tone === 'amber' ? 'bg-[var(--color-warning-surface)] text-[var(--color-warning-text)]' :
                          'bg-[var(--color-selection)] text-[var(--color-action)]'
                        )}>
                          <Icon className="h-5 w-5" aria-hidden />
                        </span>
                        <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)] transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </div>
                      <p className="mt-3 text-sm font-medium text-[var(--color-text-muted)]">{item.label}</p>
                      <p className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)]" data-testid="admin-operations-count">{item.value.toLocaleString()}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{item.detail}</p>
                    </Link>
                  );
                })}
              </div>
              <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
                <section className={panelClass} aria-labelledby="attention-heading" data-testid="admin-operational-attention">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 id="attention-heading" className="text-lg font-bold text-[var(--color-text)]">Operational attention</h3>
                      {attention.length > 0 && (
                        <span className="rounded-full bg-[var(--color-warning-surface)] px-2 py-0.5 text-xs font-bold text-[var(--color-warning-text)]">{attention.length} shown</span>
                      )}
                    </div>
                    <Link to="/admin/live-trips" className={'text-sm font-semibold text-[var(--color-brand)] underline-offset-4 hover:underline ' + linkFocus}>
                      Review trips
                    </Link>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">From the first 25 active and 25 paused trips; not a complete fleet alert count.</p>
                  {attention.length === 0 ? (
                    <p className="mt-5 rounded-xl bg-[var(--color-raised)] p-4 text-sm text-[var(--color-text-muted)]">
                      No GPS issues or paused trips in the loaded snapshot. Other alerts may still require review.
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-[var(--color-border)]">
                      {attention.map(({ trip, label, tone }) => (
                        <li key={trip.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-warning-surface)] text-[var(--color-warning-text)]">
                              <CircleAlert className="h-5 w-5" aria-hidden />
                            </span>
                            <div className="min-w-0">
                              <p className="break-words font-semibold text-[var(--color-text)]">{trip.routeName}</p>
                              <p className="text-xs text-[var(--color-text-muted)]">Bus {trip.busLabel} · {trip.tripPatternName}</p>
                              <div className="mt-1"><StatusPill tone={tone}>{label}</StatusPill></div>
                            </div>
                          </div>
                          <Link to={'/admin/trips/' + trip.id} className={'inline-flex min-h-10 items-center rounded-lg border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-raised)] ' + linkFocus}>View trip</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className={panelClass} aria-labelledby="active-trips-heading">
                  <div className="flex items-center justify-between gap-3">
                    <h3 id="active-trips-heading" className="text-lg font-bold text-[var(--color-text)]">Active trip snapshot</h3>
                    <Link to="/admin/live-trips?tripStatus=active" className={'text-sm font-semibold text-[var(--color-brand)] underline-offset-4 hover:underline ' + linkFocus}>All trips</Link>
                  </div>
                  {liveTrips.length === 0 ? (
                    <p className="mt-5 rounded-xl bg-[var(--color-raised)] p-4 text-sm text-[var(--color-text-muted)]">No active trips in the current snapshot.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-[#E7ECF0]">
                      {liveTrips.map((trip) => (
                        <li key={trip.id}>
                          <Link to={'/admin/trips/' + trip.id} className={'flex min-h-16 items-center justify-between gap-3 rounded-lg py-2 hover:bg-[var(--color-raised)] ' + linkFocus}>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-[var(--color-text)]">{trip.routeName}</span>
                              <span className="block truncate text-xs text-[var(--color-text-muted)]">Bus {trip.busLabel} · {trip.driverLabel}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <StatusPill tone={trip.locationStatus === 'live' ? 'success' : 'warning'}>
                                {trip.locationStatus === 'live' ? 'GPS live' : 'GPS unavailable'}
                              </StatusPill>
                              <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)]" aria-hidden />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                    Checked {new Intl.DateTimeFormat('en-CA', { timeZone: ALBERTA_TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(operations.checkedAt)} · Refresh for current information.
                  </p>
                </section>
              </div>
            </>
          )}
        </section>

        <section className={panelClass} aria-labelledby="transportation-summary-heading" data-testid="transportation-summary">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="transportation-summary-heading" className="text-lg font-bold text-[var(--color-text)]">Transportation summary</h2>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Active records in your permitted transportation directory.</p>
            </div>
            <CalendarClock className="h-5 w-5 text-[var(--color-text-muted)]" aria-hidden />
          </div>
          <div className="mt-4" aria-live="polite" aria-busy={summary.kind === 'loading'}>
            {summary.kind === 'loading' && (
              <DataState title="Loading transportation summary" message="Checking your active transportation records." />
            )}
            {summary.kind === 'error' && (
              <div data-testid="transportation-summary-error">
                <DataState title="Transportation summary unavailable" message="Active record counts could not be verified." />
                <Button variant="secondary" onClick={() => void loadDashboard()}>Retry summary</Button>
              </div>
            )}
            {summary.kind === 'ready' && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {summaryItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.key}
                      to={item.to}
                      className={'group flex min-h-32 min-w-0 flex-col justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 transition-all hover:border-[var(--color-focus)] hover:bg-[var(--color-surface)] hover:shadow-sm ' + linkFocus}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-selection)] text-[var(--color-action)]"><Icon className="h-4 w-4" aria-hidden /></span>
                        <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)] transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                      <span className="mt-3">
                        <span className="block text-2xl font-bold text-[var(--color-text)]">{summary.snapshot[item.key].toLocaleString()}</span>
                        <span className="block text-sm font-medium text-[var(--color-text-muted)]">{item.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="trip-search-section-heading">
          <div>
            <h2 id="trip-search-section-heading" className="text-lg font-bold text-[var(--color-text)]">Find a trip</h2>
            <p className="text-xs text-[var(--color-text-muted)]">Search trip history and operating services with the existing filters.</p>
          </div>
          <AdminTripSearchSection />
        </section>
      </div>
    </DashboardLayout>
  );
}
