import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminPage, type AdminListEntity } from '@/services/adminPaginationService';
import type { AdminPageSize, PaginatedResult } from '@/types/pagination';

export function usePaginatedAdminList<T>(entity: AdminListEntity) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<AdminPageSize>(50);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatusState] = useState<string | null>(null);
  const [schoolId, setSchoolIdState] = useState<string | null>(null);
  const [result, setResult] = useState<PaginatedResult<T>>({ rows: [], totalCount: 0, page: 1, pageSize: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setSearch(searchInput); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const reload = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const next = await fetchAdminPage<T>(entity, { page, pageSize, search, status, schoolId });
      if (request !== sequence.current) return;
      if (next.rows.length === 0 && next.totalCount > 0 && page > 1) { setPage(page - 1); return; }
      setResult(next);
    } catch (loadError) {
      if (request === sequence.current) setError(loadError instanceof Error ? loadError.message : 'Unable to load this list.');
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [entity, page, pageSize, schoolId, search, status]);

  useEffect(() => { void reload(); return () => { sequence.current += 1; }; }, [reload]);

  return {
    ...result, page, pageSize, searchInput, status, schoolId, loading, error, reload,
    setSearchInput,
    setPage,
    setPageSize: (value: AdminPageSize) => { setPage(1); setPageSizeState(value); },
    setStatus: (value: string | null) => { setPage(1); setStatusState(value); },
    setSchoolId: (value: string | null) => { setPage(1); setSchoolIdState(value); },
  };
}
