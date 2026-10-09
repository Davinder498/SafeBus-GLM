import { supabase, supabaseConfigError } from '@/lib/supabase';
import {
  mapAdminTripOverviewRow,
  type AdminTripOverviewRpcRow,
} from '@/services/adminTripOverviewService';
import type { AdminTripOverviewItem } from '@/types/adminTripOverview';
import type { AdminTripSearchQuery } from '@/types/adminTripSearch';
import type { PaginatedResult } from '@/types/pagination';

export async function searchAdminTrips(
  query: AdminTripSearchQuery,
): Promise<PaginatedResult<AdminTripOverviewItem>> {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  const { data, error } = await supabase.rpc('search_admin_trips', {
    p_from_date: query.fromDate,
    p_to_date: query.toDate,
    p_status: query.status,
    p_page: query.page,
    p_page_size: query.pageSize,
  });
  if (error) throw new Error('Unable to load trips. Please try again.');
  const result = data as unknown as { rows: AdminTripOverviewRpcRow[]; totalCount: number };
  if (
    !result ||
    !Array.isArray(result.rows) ||
    !Number.isSafeInteger(result.totalCount) ||
    result.totalCount < 0
  ) {
    throw new Error('Unable to load trips. Please try again.');
  }
  return {
    rows: result.rows.map(mapAdminTripOverviewRow),
    totalCount: result.totalCount,
    page: query.page,
    pageSize: query.pageSize,
  };
}
