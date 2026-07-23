import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Bus, CalendarDays, Clock3, RefreshCw } from 'lucide-react';
import { DashboardLayout, driverNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchDriverCompletedTripHistory } from '@/services/driverTripHistoryService';
import type { DriverCompletedTripHistoryItem } from '@/types/driverTripHistory';

type HistoryState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; trips: DriverCompletedTripHistoryItem[] };

export function DriverTripHistoryPage() {
  const [state, setState] = useState<HistoryState>({ kind: 'loading' });

  const loadHistory = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', trips: await fetchDriverCompletedTripHistory() });
    } catch (error) {
      setState({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'We could not load your completed trips. Please try again.',
      });
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <DashboardLayout title="Trip History" portal="driver" navItems={[]} navGroups={driverNavGroups}>
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="History"
          title="Completed trips"
          description="Review your recently completed daily runs. Routes remain reusable for future trips."
          action={
            <Button
              type="button"
              variant="secondary"
              leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
              onClick={() => void loadHistory()}
              disabled={state.kind === 'loading'}
            >
              Refresh
            </Button>
          }
        />

        {state.kind === 'loading' && (
          <DataState
            title="Loading completed trips"
            message="Checking your recent trip history..."
          />
        )}

        {state.kind === 'error' && (
          <div data-testid="driver-trip-history-error">
            <DataState title="Could not load completed trips" message={state.message} />
          </div>
        )}

        {state.kind === 'ready' && state.trips.length === 0 && (
          <div data-testid="driver-trip-history-empty">
            <DataState
              title="No completed trips yet"
              message="Trips will appear here after you start and end them."
            />
          </div>
        )}

        {state.kind === 'ready' && state.trips.length > 0 && (
          <div className="space-y-4" data-testid="driver-trip-history-list">
            {state.trips.map((trip) => (
              <CompletedTripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function CompletedTripCard({ trip }: { trip: DriverCompletedTripHistoryItem }) {
  return (
    <Card className="p-5" data-testid="driver-completed-trip-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-500">Completed route</p>
          <h2
            className="mt-1 break-words text-xl font-bold text-navy-900"
            data-testid="driver-completed-trip-route-name"
          >
            {trip.routeName}
          </h2>
          <p className="mt-1 text-sm font-medium text-gray-600">
            {trip.tripName} · Bus {trip.busNumber}
          </p>
        </div>
        <StatusPill tone="neutral">Completed</StatusPill>
      </div>

      <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm text-gray-700 sm:grid-cols-3">
        <HistoryDetail
          icon={<CalendarDays />}
          label="Service date"
          value={formatDate(trip.serviceDate)}
        />
        <HistoryDetail
          icon={<Clock3 />}
          label="Trip time"
          value={`${formatTime(trip.startedAt)}–${formatTime(trip.endedAt)}`}
        />
        <HistoryDetail
          icon={<Bus />}
          label="Duration"
          value={formatDuration(trip.startedAt, trip.endedAt)}
        />
      </dl>
    </Card>
  );
}

function HistoryDetail({
  icon,
  label,
  value,
}: {
  icon: ReactElement;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-gray-400 [&>svg]:h-4 [&>svg]:w-4" aria-hidden>
        {icon}
      </span>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
        <dd className="mt-1 font-semibold text-gray-800">{value}</dd>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(startedAt: string, endedAt: string): string {
  const durationMinutes = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000),
  );
  if (!Number.isFinite(durationMinutes)) return 'Unavailable';
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}
