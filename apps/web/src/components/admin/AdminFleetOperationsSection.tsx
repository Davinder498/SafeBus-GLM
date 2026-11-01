import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, BusFront, CircleCheck, Clock3, RadioTower, RefreshCw } from 'lucide-react';
import { AdminFleetMap, type FleetMapFormatters } from '@/components/admin/AdminFleetMap';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAdminTripRefresh } from '@/hooks/useAdminTripRefresh';
import { useMapTileConfig } from '@/hooks/useMapTileConfig';
import { fetchAdminLiveTrips } from '@/services/adminLiveMonitoringService';
import type { AdminLiveTrip, LocationFreshness } from '@/types/adminLiveMonitoring';

type FleetState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; trips: AdminLiveTrip[]; checkedAt: Date };
type FleetFilter = 'all' | 'live' | 'attention';

const panelClass =
  'min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-card sm:p-5';

function gpsLabel(status: LocationFreshness) {
  if (status === 'live') return 'GPS live';
  if (status === 'stale') return 'GPS stale';
  if (status === 'missing') return 'No GPS signal';
  return 'GPS unverified';
}

function busLabel(trip: AdminLiveTrip) {
  const label = trip.busLabel?.trim();
  if (!label) return 'Bus not identified';
  return /^bus\s/i.test(label) ? label : 'Bus ' + label;
}

function timeLabel(iso: string) {
  const timestamp = new Date(iso);
  return Number.isNaN(timestamp.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Edmonton',
        hour: 'numeric',
        minute: '2-digit',
      }).format(timestamp);
}

const mapFormatters: FleetMapFormatters = {
  formatTimestamp: timeLabel,
  formatSpeed: (speed) =>
    speed === null || !Number.isFinite(speed) || speed < 0
      ? 'Unavailable'
      : Math.round(speed * 3.6) + ' km/h',
  locationLabel: gpsLabel,
  safeFleetLabel: busLabel,
};

function statusTone(status: LocationFreshness): 'success' | 'warning' | 'danger' {
  if (status === 'live') return 'success';
  return status === 'stale' ? 'warning' : 'danger';
}

function needsAttention(trip: AdminLiveTrip) {
  return trip.locationStatus !== 'live' || trip.issueLabel !== 'OK';
}

/** Enable for tenant_admin and transportation_admin only while the broader
 * spatial RPC surface is under review. The deployed base fleet RPC already
 * applies school scope; this conservative UI gate is not an authorization rule.
 * Keep school-level fleet-map rollout separate from route-overlay hardening. */
export function AdminFleetOperationsSection() {
  const tileConfig = useMapTileConfig();
  const [state, setState] = useState<FleetState>({ kind: 'loading' });
  const [filter, setFilter] = useState<FleetFilter>('all');
  const [visibleCount, setVisibleCount] = useState(10);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      // Use the existing fleet RPC; do not invoke unreviewed viewport or
      // route-overlay RPCs from this milestone.
      const trips = await fetchAdminLiveTrips();
      if (request === sequence.current) {
        setState({ kind: 'ready', trips, checkedAt: new Date() });
      }
    } catch {
      // Fail closed. Never leave previous GPS positions looking current after
      // a failed request or authorization loss.
      if (request === sequence.current) setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { sequence.current += 1; };
  }, [refresh]);

  useAdminTripRefresh(
    () => { void refresh(); },
    () => { sequence.current += 1; setState({ kind: 'error' }); },
  );

  const trips = state.kind === 'ready' ? state.trips : [];
  const liveCount = trips.filter((trip) => trip.locationStatus === 'live').length;
  const staleCount = trips.filter((trip) => trip.locationStatus === 'stale').length;
  const missingCount = trips.filter(
    (trip) => trip.locationStatus === 'missing' || trip.locationStatus === 'invalid',
  ).length;
  const attention = trips.filter(needsAttention);
  const filtered = trips.filter((trip) =>
    filter === 'all' || (filter === 'live' ? trip.locationStatus === 'live' : needsAttention(trip)),
  );

  return (
    <section className="space-y-4" aria-labelledby="admin-fleet-heading" data-testid="admin-fleet-operations">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="admin-fleet-heading" className="text-xl font-bold text-[var(--color-text)]">
            Fleet monitoring
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Active bus trips only. GPS freshness is server-reported; no students are tracked.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Refresh fleet
        </Button>
      </div>

      {state.kind === 'loading' && (
        <div className={panelClass}>
          <DataState title="Loading live fleet" message="Checking authorized active trips." />
        </div>
      )}
      {state.kind === 'error' && (
        <div className={panelClass} role="alert" data-testid="admin-fleet-error">
          <DataState
            title="Fleet status unavailable"
            message="Live GPS could not be verified. No previous bus positions are displayed."
          />
          <Button onClick={() => void refresh()}>Retry fleet</Button>
        </div>
      )}
      {state.kind === 'ready' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="admin-fleet-summary">
            {[
              { label: 'Active trips', value: trips.length, detail: 'Active fleet snapshot', icon: BusFront, tone: 'text-[var(--color-brand)] bg-[var(--color-raised)]' },
              { label: 'GPS live', value: liveCount, detail: 'Current signal reported', icon: CircleCheck, tone: 'text-success-700 bg-success-50' },
              { label: 'GPS stale', value: staleCount, detail: 'Update overdue', icon: Clock3, tone: 'text-warning-700 bg-warning-50' },
              { label: 'Missing / invalid', value: missingCount, detail: 'Location not verified', icon: RadioTower, tone: 'text-danger-700 bg-danger-50' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.label} className="p-4">
                  <span className={'inline-flex h-10 w-10 items-center justify-center rounded-xl ' + item.tone}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-[var(--color-text-muted)]">{item.label}</p>
                  <p className="mt-1 text-3xl font-bold text-[var(--color-text)]">{item.value.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{item.detail}</p>
                </Card>
              );
            })}
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
            <div className="min-w-0">
              <AdminFleetMap trips={trips} tileConfig={tileConfig} formatters={mapFormatters} />
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                Markers are last reported bus positions, not confirmed current whereabouts.
                Stale GPS does not establish that a bus is on time.
              </p>
            </div>
            <div className="min-w-0 space-y-4">
              <div className={panelClass}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-bold text-[var(--color-text)]">Active fleet</h3>
                  <span className="text-xs text-[var(--color-text-muted)]">{trips.length} active trips</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter active fleet">
                  {([
                    ['all', 'All'],
                    ['live', 'GPS live'],
                    ['attention', 'Needs attention'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={filter === value}
                      className={'min-h-10 rounded-full px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ' +
                        (filter === value
                          ? 'bg-[var(--color-action)] text-[var(--color-on-action)]'
                          : 'bg-[var(--color-raised)] text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]')}
                      onClick={() => { setFilter(value); setVisibleCount(10); }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {filtered.length === 0 ? (
                  <p className="mt-4 rounded-xl bg-[var(--color-raised)] p-4 text-sm text-[var(--color-text-muted)]">
                    No active trips match this GPS filter.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-[var(--color-border)]" data-testid="admin-fleet-list">
                    {filtered.slice(0, visibleCount).map((trip, index) => (
                      <li key={[trip.busLabel, trip.routeName, trip.startedAt, index].join('-')} className="py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-bold text-[var(--color-text)]">{busLabel(trip)}</p>
                            <p className="break-words text-sm text-[var(--color-text-muted)]">
                              {trip.routeName ?? 'Route unavailable'} · {trip.tripType ?? 'Active service'}
                            </p>
                          </div>
                          <StatusPill tone={statusTone(trip.locationStatus)}>
                            {gpsLabel(trip.locationStatus)}
                          </StatusPill>
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-[var(--color-text-muted)] sm:grid-cols-2">
                          <p>Driver: {trip.driverName ?? 'Unavailable'}</p>
                          <p>Next stop: {trip.nextStopName ?? 'Not available'}</p>
                          <p>Last GPS: {trip.latestLocationAt ? timeLabel(trip.latestLocationAt) : 'Never received'}</p>
                          <p>ETA: {trip.locationStatus === 'live' && trip.etaStatus === 'available' && trip.etaLabel
                            ? trip.etaLabel : 'Not verified'}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {filtered.length > visibleCount && (
                  <Button variant="outline" size="sm" onClick={() => setVisibleCount((count) => count + 10)}>
                    Show more ({filtered.length - visibleCount} remaining)
                  </Button>
                )}
              </div>

              <div className={panelClass} data-testid="admin-fleet-attention">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-bold text-[var(--color-text)]">GPS attention</h3>
                  {attention.length > 0 && <StatusPill tone="warning">{attention.length + ' affected'}</StatusPill>}
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Signal issues only. Trip delays and operational exceptions are reviewed below.
                </p>
                {attention.length === 0 ? (
                  <p className="mt-3 rounded-lg bg-[var(--color-raised)] p-3 text-sm text-[var(--color-text-muted)]">
                    No GPS issues reported in this snapshot. This does not certify trips as on time.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {attention.slice(0, 5).map((trip, i) => (
                      <li key={[trip.busLabel, trip.startedAt, i].join('-')} className="flex items-start gap-2 rounded-lg bg-[var(--color-raised)] p-3 text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" aria-hidden />
                        <span className="min-w-0 break-words">
                          <strong className="text-[var(--color-text)]">{busLabel(trip)}:</strong>{' '}
                          <span className="text-[var(--color-text-muted)]">
                            {trip.issueLabel === 'OK' ? gpsLabel(trip.locationStatus) : trip.issueLabel}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {attention.length > 5 && (
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    Showing 5 of {attention.length} issues. Use the Needs attention filter above.
                  </p>
                )}
                <Link
                  to="/admin/trips"
                  className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-[var(--color-brand)] underline-offset-4 hover:underline"
                >
                  Review operational trip details
                </Link>
              </div>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]" data-testid="admin-fleet-checked-at">
            Last checked {timeLabel(state.checkedAt.toISOString())} (Alberta time).
            Refresh to verify newer information.
          </p>
        </>
      )}
    </section>
  );
}
