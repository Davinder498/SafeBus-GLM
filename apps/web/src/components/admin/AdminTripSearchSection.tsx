import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminTripTable } from '@/components/admin/AdminTripTable';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { AdminTripAccessError, fetchAdminTripOperations } from '@/services/adminTripDetailService';
import { useAdminTripRefresh } from '@/hooks/useAdminTripRefresh';
import type { AdminTripStatus } from '@/types/adminTripOverview';
import type { AdminTripOperation } from '@/types/adminTripDetail';
import { readTripListQuery } from '@/utils/adminTripListQuery';
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
  | { kind: 'error'; message: string }
  | { kind: 'ready'; result: PaginatedResult<AdminTripOperation> };

const statuses: Array<{ value: AdminTripStatus | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function AdminTripSearchSection() {
  const [params, setParams] = useSearchParams();
  const [initial] = useState(() => readTripListQuery(params));
  const [selection, setSelection] = useState<AdminTripDateSelection>(() => {
    const today = albertaToday();
    return {
      mode: initial.mode,
      date: initial.query.fromDate ?? today,
      fromDate: initial.query.fromDate ?? today,
      toDate: initial.query.toDate ?? today,
    };
  });
  const [query, setQuery] = useState<AdminTripSearchQuery>(initial.query);
  const [state, setState] = useState<SearchState>({ kind: 'loading' });
  const appliedMode = useRef<AdminTripDateMode>(initial.mode);
  const [refreshError, setRefreshError] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const sequence = useRef(0);

  const load = useCallback(
    async (background = false) => {
      const request = ++sequence.current;
      if (!background) setState({ kind: 'loading' });
      try {
        const result = await fetchAdminTripOperations(query);
        if (request !== sequence.current) return;
        if (result.rows.length === 0 && result.totalCount > 0 && query.page > 1) {
          setQuery((current) => ({
            ...current,
            page: Math.ceil(result.totalCount / current.pageSize),
          }));
          return;
        }
        setState({ kind: 'ready', result });
        setRefreshError(false);
      } catch (cause) {
        if (request === sequence.current) {
          if (background && !(cause instanceof AdminTripAccessError)) {
            setRefreshError(true);
            setState((current) =>
              current.kind === 'ready'
                ? {
                    ...current,
                    result: {
                      ...current.result,
                      rows: current.result.rows.map((row) =>
                        row.locationStatus === 'not_applicable'
                          ? row
                          : {
                              ...row,
                              locationStatus: 'invalid',
                              etaLabel: null,
                              nextStopName: null,
                            },
                      ),
                    },
                  }
                : current,
            );
          } else
            setState({
              kind: 'error',
              message: cause instanceof Error ? cause.message : 'Could not load trips.',
            });
        }
      }
    },
    [query],
  );

  useEffect(() => {
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);

  useEffect(() => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries({
          tripFrom: query.fromDate,
          tripTo: query.toDate,
          tripStatus: query.status,
          tripPage: String(query.page),
          tripSize: String(query.pageSize),
          tripMode: appliedMode.current,
        })) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }, [query, setParams]);

  const refresh = useCallback(
    (background = true) => {
      const today = albertaToday();
      if (appliedMode.current === 'today' && query.fromDate !== today) {
        sequence.current += 1;
        setQuery((current) => ({ ...current, fromDate: today, toDate: today, page: 1 }));
        return;
      }
      void load(background);
    },
    [query.fromDate, load],
  );
  useAdminTripRefresh(refresh, () => {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            result: {
              ...current.result,
              rows: current.result.rows.map((row) =>
                row.locationStatus === 'not_applicable'
                  ? row
                  : { ...row, locationStatus: 'invalid', etaLabel: null, nextStopName: null },
              ),
            },
          }
        : current,
    );
  });

  function applyDates(event: React.FormEvent) {
    event.preventDefault();
    try {
      const bounds = adminTripDateBounds(selection);
      setValidationError(null);
      appliedMode.current = selection.mode;
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
        <div className="flex items-center gap-3">
          <h2 id="trip-search-heading" className="text-xl font-bold text-navy-900">
            Trips
          </h2>
          <span className="text-xs font-medium text-slate-500">Alberta time</span>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => refresh(false)}
          disabled={state.kind === 'loading'}
        >
          {state.kind === 'error' ? 'Retry trips' : 'Refresh trips'}
        </Button>
      </div>

      <form className="mt-4" onSubmit={applyDates} noValidate>
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

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter trips by status">
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
        <p className="text-sm font-medium text-gray-600" data-testid="trip-search-date-label">
          {dateLabel}
        </p>
      </div>
      <div className="mt-3" aria-live="polite" aria-busy={state.kind === 'loading'}>
        {refreshError && (
          <p className="mb-3 text-sm font-semibold text-danger-700" role="alert">
            Trips could not be refreshed. The last checked list is shown. Location and ETA may be
            out of date.
          </p>
        )}
        {state.kind === 'loading' && (
          <DataState
            title="Loading trips"
            message="Finding trips for the selected dates and status."
          />
        )}
        {state.kind === 'error' && (
          <div data-testid="trip-search-error">
            <div className="rounded-xl border border-danger-200 bg-danger-50 p-4" role="alert">
              <p className="text-sm font-semibold text-danger-700">Could not load trips</p>
              <p className="mt-1 text-sm text-gray-700">{state.message}</p>
            </div>
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
