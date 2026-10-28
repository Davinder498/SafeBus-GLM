import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminTripTable } from '@/components/admin/AdminTripTable';
import { Button } from '@/components/ui/Button';
import { useAdminTripRefresh } from '@/hooks/useAdminTripRefresh';
import { searchAdminTrips } from '@/services/adminTripSearchService';
import type { AdminTripOverviewItem } from '@/types/adminTripOverview';
import type { AdminPageSize, PaginatedResult } from '@/types/pagination';
import { ALBERTA_TIME_ZONE } from '@/utils/adminTripDates';

export function AdminOngoingTrips() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<AdminPageSize>(25);
  const [result, setResult] = useState<PaginatedResult<AdminTripOverviewItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const sequence = useRef(0);
  const load = useCallback(
    async (background = false) => {
      const request = ++sequence.current;
      if (!background) setResult(null);
      setLoading(true);
      try {
        const next = await searchAdminTrips({
          fromDate: null,
          toDate: null,
          status: 'ongoing',
          page,
          pageSize,
        });
        if (request !== sequence.current) return;
        if (!next.rows.length && next.totalCount > 0 && page > 1) {
          setPage(Math.ceil(next.totalCount / pageSize));
          return;
        }
        setResult(next);
        setCheckedAt(new Date().toISOString());
        setError(false);
      } catch {
        if (request === sequence.current) setError(true);
      } finally {
        if (request === sequence.current) setLoading(false);
      }
    },
    [page, pageSize],
  );

  useEffect(() => {
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);
  useAdminTripRefresh(() => void load(true));

  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
      aria-labelledby="ongoing-trips-heading"
      data-testid="admin-ongoing-trips"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ongoing-trips-heading" className="text-xl font-bold text-navy-900">
          Ongoing trips{result ? ` (${result.totalCount})` : ''}
        </h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void load(true)}
        >
          {error ? 'Retry ongoing trips' : 'Refresh ongoing trips'}
        </Button>
      </div>
      {error && (
        <p className="mt-3 text-sm font-semibold text-danger-700" role="alert">
          {result
            ? 'Ongoing trips could not be refreshed. The last checked list is shown.'
            : 'Could not load ongoing trips.'}
        </p>
      )}
      <div aria-live="polite" aria-busy={loading}>
        {!result && loading && <p className="mt-3 text-sm text-gray-600">Loading ongoing trips…</p>}
        {result &&
          (result.rows.length ? (
            <AdminTripTable
              trips={result.rows}
              timeZone={ALBERTA_TIME_ZONE}
              testId="admin-ongoing-trips-table"
              resultsLabel="Ongoing trip results"
            />
          ) : (
            <p className="mt-3 text-sm text-gray-600">No ongoing trips.</p>
          ))}
      </div>
      {checkedAt && (
        <p className="mt-3 text-xs text-slate-500">
          Last checked{' '}
          <time dateTime={checkedAt}>
            {new Date(checkedAt).toLocaleTimeString(undefined, {
              timeZone: ALBERTA_TIME_ZONE,
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
            })}
          </time>{' '}
          · Alberta time
        </p>
      )}
      {result && result.totalCount > pageSize && (
        <div className="mt-4">
          <AdminPagination
            page={page}
            pageSize={pageSize}
            totalCount={result.totalCount}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPage(1);
              setPageSize(size);
            }}
          />
        </div>
      )}
    </section>
  );
}
