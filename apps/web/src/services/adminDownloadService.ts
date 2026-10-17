import { supabase, supabaseConfigError } from '@/lib/supabase';
import { fetchAdminPage } from '@/services/adminPaginationService';
import type { AdminListQuery } from '@/types/pagination';
import type { DownloadEntity, DownloadRow } from '@/utils/dataDownloads';

export interface DownloadContext {
  userId: string;
  tenantId: string;
}
export interface DownloadOptions {
  signal: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
  maxRecords?: number;
}
export const MAX_DOWNLOAD_RECORDS = 100_000;

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Downloads are unavailable.');
  return supabase;
}
export async function verifyDownloadContext(
  expected: DownloadContext,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const {
    data: { user },
    error,
  } = await client().auth.getUser();
  signal.throwIfAborted();
  if (error || !user || user.id !== expected.userId)
    throw new Error('Sign in again before downloading.');
  const result = await client()
    .from('profiles')
    .select('id,tenant_id,role,status')
    .eq('id', user.id)
    .abortSignal(signal)
    .single();
  signal.throwIfAborted();
  if (
    result.error ||
    result.data?.tenant_id !== expected.tenantId ||
    result.data.role !== 'tenant_admin' ||
    result.data.status !== 'active'
  ) {
    throw new Error('An active tenant administrator is required to download records.');
  }
}

/** Existing authenticated list RPCs retain all tenant/session/RLS restrictions. */
export async function collectDownloadRecords(
  entity: DownloadEntity,
  query: Omit<AdminListQuery, 'page' | 'pageSize'>,
  context: DownloadContext,
  { signal, onProgress, maxRecords = MAX_DOWNLOAD_RECORDS }: DownloadOptions,
): Promise<DownloadRow[]> {
  await verifyDownloadContext(context, signal);
  const rows: DownloadRow[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  for (let page = 1; ; page++) {
    signal.throwIfAborted();
    const result = await fetchAdminPage<DownloadRow>(
      entity,
      { ...query, page, pageSize: 100 },
      signal,
    );
    signal.throwIfAborted();
    if (
      !Number.isSafeInteger(result.totalCount) ||
      result.totalCount < 0 ||
      result.totalCount > maxRecords
    ) {
      throw new Error(
        `Narrow your search to ${maxRecords.toLocaleString()} records or fewer for this download.`,
      );
    }
    if (total === null) total = result.totalCount;
    if (
      result.totalCount !== total ||
      result.page !== page ||
      result.pageSize !== 100 ||
      !Array.isArray(result.rows) ||
      result.rows.length !== Math.min(100, total - rows.length)
    ) {
      throw new Error('The list changed while downloading. Try again.');
    }
    for (const row of result.rows) {
      if (
        !row ||
        typeof row.id !== 'string' ||
        !row.id ||
        row.tenant_id !== context.tenantId ||
        seen.has(row.id)
      ) {
        throw new Error('The records could not be verified. Reload the list and try again.');
      }
      seen.add(row.id);
      rows.push(row);
    }
    onProgress?.(rows.length, total);
    if (rows.length === total) break;
  }
  // Enrich only the exact current assignment selected by the student directory.
  if (entity === 'students') {
    const ids = [
      ...new Set(
        rows.flatMap((row) =>
          typeof row.bus_assignment_id === 'string' ? [row.bus_assignment_id] : [],
        ),
      ),
    ];
    const seats = new Map<string, number | null>();
    for (let start = 0; start < ids.length; start += 100) {
      signal.throwIfAborted();
      const batch = ids.slice(start, start + 100);
      const result = await client()
        .from('student_bus_assignments')
        .select('id,tenant_id,seat_number')
        .in('id', batch)
        .abortSignal(signal);
      signal.throwIfAborted();
      if (result.error || result.data?.length !== batch.length)
        throw new Error('Transportation changed while downloading. Try again.');
      for (const row of result.data) {
        if (row.tenant_id !== context.tenantId || !batch.includes(row.id))
          throw new Error('The records could not be verified.');
        seats.set(row.id, row.seat_number);
      }
    }
    for (const row of rows) row.seat_number = seats.get(String(row.bus_assignment_id)) ?? null;
  }
  await verifyDownloadContext(context, signal);
  signal.throwIfAborted();
  return rows;
}
