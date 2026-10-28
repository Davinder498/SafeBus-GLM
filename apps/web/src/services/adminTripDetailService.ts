import { supabase, supabaseConfigError } from '@/lib/supabase';
import { mapAdminTripOverviewRow, type AdminTripOverviewRpcRow } from './adminTripOverviewService';
import type { AdminTripSearchQuery } from '@/types/adminTripSearch';
import type { PaginatedResult } from '@/types/pagination';
import type { AdminTripDetail, AdminTripOperation } from '@/types/adminTripDetail';

type OperationRow = AdminTripOverviewRpcRow & {
  location_status: AdminTripOperation['locationStatus'];
  latest_location_at: string | null;
  eta_label: string | null;
  next_stop_name: string | null;
};

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export class AdminTripAccessError extends Error {}

function failure(error: { code?: string }) {
  if (error.code === '42501' || error.code === 'PGRST301' || error.code === 'PGRST303')
    return new AdminTripAccessError(
      'Trip access is unavailable. Check your session and administrator permissions.',
    );
  if (error.code === 'PGRST202' || error.code === '42883')
    return new Error(
      'Trip details are temporarily unavailable. The platform database update is pending.',
    );
  return new Error('Unable to load trips. Check your access and try again.');
}

export async function fetchAdminTripOperations(
  query: AdminTripSearchQuery,
): Promise<PaginatedResult<AdminTripOperation>> {
  const { data, error } = await client().rpc('get_admin_trip_operations', {
    p_from_date: query.fromDate,
    p_to_date: query.toDate,
    p_status: query.status,
    p_page: query.page,
    p_page_size: query.pageSize,
  });
  if (error) throw failure(error);
  const result = data as unknown as { rows: OperationRow[]; totalCount: number };
  return {
    ...result,
    page: query.page,
    pageSize: query.pageSize,
    rows: result.rows.map((row) => ({
      ...mapAdminTripOverviewRow(row),
      locationStatus: row.location_status,
      latestLocationAt: row.latest_location_at,
      etaLabel: row.eta_label,
      nextStopName: row.next_stop_name,
    })),
  };
}

export async function fetchAdminTripDetail(tripId: string): Promise<AdminTripDetail | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId)) return null;
  const { data, error } = await client().rpc('get_admin_trip_detail', { p_trip_id: tripId });
  if (error) throw failure(error);
  if (!data) return null;
  const result = data as unknown as Omit<AdminTripDetail, 'trip'> & {
    trip: AdminTripOverviewRpcRow;
  };
  return { ...result, trip: mapAdminTripOverviewRow(result.trip) };
}
