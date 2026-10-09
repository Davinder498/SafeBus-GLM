import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminTripTable } from '@/components/admin/AdminTripTable';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { searchAdminTrips } from '@/services/adminTripSearchService';
import type { AdminTripOverviewItem, AdminTripStatus } from '@/types/adminTripOverview';
import type {
  AdminTripDateMode,
  AdminTripDateSelection,
  AdminTripSearchQuery,
} from '@/types/adminTripSearch';
import type { PaginatedResult } from '@/types/pagination';
import {
  adminTripDateBounds,
  albertaToday,
  ALBERTA_TIME_ZONE,
  formatAdminTripDate,
} from '@/utils/adminTripDates';

type SearchState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; result: PaginatedResult<AdminTripOverviewItem> };

const statuses: Array<{ value: AdminTripStatus | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function AdminTripSearchSection() {
  const [selection, setSelection] = useState<AdminTripDateSelection>(() => {
    const today = albertaToday();
    return { mode: 'today', date: today, fromDate: today, toDate: today };
  });
  const [query, setQuery] = useState<AdminTripSearchQuery>(() => ({
    ...adminTripDateBounds(selection),
    status: null,
    page: 1,
    pageSize: 25,
  }));
  const [state, setState] = useState<SearchState>({ kind: 'loading' });
  const [validationError, setValidationError] = useState<string | null>(null);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const request = ++sequence.current;
    setState({ kind: 'loading' });
    try {
      const result = await searchAdminTrips(query);
      if (request !== sequence.current) return;
      if (result.rows.length === 0 && result.totalCount > 0 && query.page > 1) {
        setQuery((current) => ({
          ...current,
          page: Math.ceil(result.totalCount / current.pageSize),
        }));
        return;
      }
      setState({ kind: 'ready', result });
    } catch {
      if (request === sequence.current) setState({ kind: 'error' });
    }
  }, [query]);

  useEffect(() => {
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);

  function applyDates(event: React.FormEvent) {
    event.preventDefault();
    try {
      const bounds = adminTripDateBounds(selection);
      setValidationError(null);
      sequence.current += 1;
      setState({ kind: 'loading' });
      setQuery((current) => ({ ...current, ...bounds, page: 1 }));
    } catch (cause) {
      setValidationError(cause instanceof Error ? cause.message : 'Choose valid dates.');
    }
  }

  function updateQuery(next: Partial<AdminTripSearchQuery>) {
    sequence.current += 1;
    setState({ kind: 'loading' });
    setQuery((current) => ({ ...current, page: 1, ...next }));
  }

  const dateLabel = !query.fromDate
    ? 'All dates'
    : query.fromDate === query.toDate
      ? formatAdminTripDate(query.fromDate)
      : `${formatAdminTripDate(query.fromDate)} – ${formatAdminTripDate(query.toDate!)}`;

  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
      aria-labelledby="trip-search-heading"
      data-testid="admin-trip-search"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="trip-search-heading" className="text-xl font-bold text-navy-900">
            Trips
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Review recorded trips by date and status. Times shown in Alberta time.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void load()}
          disabled={state.kind === 'loading'}
        >
          Refresh trips
        </Button>
      </div>

      <form className="mt-5" onSubmit={applyDates} noValidate>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <Field label="Dates" htmlFor="trip-date-mode">
            <Select
              id="trip-date-mode"
              value={selection.mode}
              onChange={(event) => {
                setValidationError(null);
                setSelection((current) => ({
                  ...current,
                  mode: event.target.value as AdminTripDateMode,
                }));
              }}
            >
              <option value="today">Today</option>
              <option value="date">Specific date</option>
              <option value="range">Date range</option>
              <option value="all">All dates</option>
            </Select>
          </Field>
          {selection.mode === 'date' && (
            <Field label="Service date" htmlFor="trip-service-date">
              <Input
                id="trip-service-date"
                type="date"
                required
                value={selection.date}
                aria-invalid={!!validationError}
                aria-describedby={validationError ? 'trip-date-error' : undefined}
                onChange={(event) =>
                  setSelection((current) => ({ ...current, date: event.target.value }))
                }
              />
            </Field>
          )}
          {selection.mode === 'range' && (
            <>
              <Field label="From date" htmlFor="trip-from-date">
                <Input
                  id="trip-from-date"
                  type="date"
                  required
                  value={selection.fromDate}
                  aria-invalid={!!validationError}
                  aria-describedby={validationError ? 'trip-date-error' : undefined}
                  onChange={(event) =>
                    setSelection((current) => ({ ...current, fromDate: event.target.value }))
                  }
                />
              </Field>
              <Field label="To date" htmlFor="trip-to-date">
                <Input
                  id="trip-to-date"
                  type="date"
                  required
                  value={selection.toDate}
                  aria-invalid={!!validationError}
                  aria-describedby={validationError ? 'trip-date-error' : undefined}
                  onChange={(event) =>
                    setSelection((current) => ({ ...current, toDate: event.target.value }))
                  }
                />
              </Field>
            </>
          )}
          <Button type="submit">Apply</Button>
        </div>
        {validationError && (
          <p
            id="trip-date-error"
            className="mt-3 text-sm font-semibold text-danger-700"
            role="alert"
          >
            {validationError}
          </p>
        )}
      </form>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter trips by status">
        {statuses.map((status) => (
          <button
            key={status.label}
            type="button"
            aria-pressed={query.status === status.value}
            onClick={() => updateQuery({ status: status.value })}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 ${query.status === status.value ? 'bg-navy-900 text-white' : 'bg-slate-100 text-gray-700 hover:bg-slate-200'}`}
          >
            {status.label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm font-medium text-gray-600" data-testid="trip-search-date-label">
        {dateLabel}
      </p>
      <div className="mt-3" aria-live="polite" aria-busy={state.kind === 'loading'}>
        {state.kind === 'loading' && (
          <DataState
            title="Loading trips"
            message="Finding trips for the selected dates and status."
          />
        )}
        {state.kind === 'error' && (
          <div data-testid="trip-search-error">
            <DataState title="Could not load trips" message="Try loading this section again." />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Retry trips
            </Button>
          </div>
        )}
        {state.kind === 'ready' && (
          <>
            {state.result.rows.length === 0 ? (
              <div data-testid="admin-trips-empty">
                <DataState
                  title="No trips found"
                  message="No recorded trips match the selected dates and status."
                />
              </div>
            ) : (
              <AdminTripTable trips={state.result.rows} timeZone={ALBERTA_TIME_ZONE} />
            )}
            <div className="mt-4">
              <AdminPagination
                page={query.page}
                pageSize={query.pageSize}
                totalCount={state.result.totalCount}
                onPageChange={(page) => updateQuery({ page })}
                onPageSizeChange={(pageSize) => updateQuery({ pageSize })}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
