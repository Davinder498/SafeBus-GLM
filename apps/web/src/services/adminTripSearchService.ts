import { supabase, supabaseConfigError } from '@/lib/supabase';
import {
  mapAdminTripOverviewRow,
  type AdminTripOverviewRpcRow,
} from '@/services/adminTripOverviewService';
import type { AdminTripOverviewItem } from '@/types/adminTripOverview';
import type { AdminTripSearchQuery } from '@/types/adminTripSearch';
import type { PaginatedResult } from '@/types/pagination';
import { adminTripDateBounds } from '@/utils/adminTripDates';

const loadError = 'Unable to load trips. Please try again.';

/** Compatibility until the prepared search RPC completes protected adoption.
 * PostgREST applies caller RLS, filters and exact count before the page range.
 * Never use the legacy overview RPC here: it truncates history at 200 runs.
 */
async function searchExistingTrips(query: AdminTripSearchQuery) {
  const client = supabase!;
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) throw new Error(loadError);
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role, tenant_id, school_id, status')
    .eq('id', identity.user.id)
    .single();
  if (
    profileError ||
    !profile ||
    profile.status !== 'active' ||
    !profile.tenant_id ||
    !['tenant_admin', 'transportation_admin', 'school_admin'].includes(profile.role) ||
    (profile.role === 'school_admin' && !profile.school_id)
  )
    throw new Error(loadError);

  let request = client
    .from('driver_trips')
    .select(
      `
    id, route_id, service_date, status, started_at, ended_at, trip_name_snapshot,
    route:routes!driver_trips_route_id_fkey!inner(route_name, route_code, tenant_id, school_id),
    pattern:route_trip_patterns!driver_trips_route_trip_pattern_id_fkey!inner(display_name, direction, route_id, tenant_id),
    bus:buses!driver_trips_bus_id_fkey!inner(bus_number, tenant_id),
    driver:drivers!driver_trips_driver_id_fkey!inner(tenant_id,
      profile:profiles!drivers_profile_id_fkey!inner(full_name, tenant_id))
  `,
      { count: 'exact' },
    )
    .eq('tenant_id', profile.tenant_id)
    .eq('route.tenant_id', profile.tenant_id)
    .eq('pattern.tenant_id', profile.tenant_id)
    .eq('bus.tenant_id', profile.tenant_id)
    .eq('driver.tenant_id', profile.tenant_id)
    .eq('driver.profile.tenant_id', profile.tenant_id)
    .in('status', ['active', 'paused', 'completed', 'cancelled']);
  if (profile.role === 'school_admin') request = request.eq('route.school_id', profile.school_id!);
  if (query.fromDate) request = request.gte('service_date', query.fromDate);
  if (query.toDate) request = request.lte('service_date', query.toDate);
  if (query.status) request = request.eq('status', query.status);
  const offset = (query.page - 1) * query.pageSize;
  const { data, count, error } = await request
    .order('service_date', { ascending: false })
    .order('started_at', { ascending: false })
    .order('id', { ascending: true })
    .range(offset, offset + query.pageSize - 1);
  if (error || !data || count === null) throw new Error(loadError);
  return {
    rows: data.map((row) => {
      // Reject inconsistent legacy references rather than presenting mismatched labels.
      if (row.pattern.route_id !== row.route_id) throw new Error(loadError);
      return mapAdminTripOverviewRow({
        trip_id: row.id,
        service_date: row.service_date,
        status: row.status as AdminTripOverviewRpcRow['status'],
        started_at: row.started_at,
        ended_at: row.ended_at,
        route_name: row.route.route_name,
        route_code: row.route.route_code,
        trip_pattern_name: row.trip_name_snapshot ?? row.pattern.display_name,
        direction: row.pattern.direction as AdminTripOverviewRpcRow['direction'],
        bus_label: row.bus.bus_number,
        driver_label: row.driver.profile.full_name,
      });
    }),
    totalCount: count,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function searchAdminTrips(
  query: AdminTripSearchQuery,
): Promise<PaginatedResult<AdminTripOverviewItem>> {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  if (
    !Number.isSafeInteger(query.page) ||
    query.page < 1 ||
    ![25, 50, 100].includes(query.pageSize) ||
    (query.status !== null &&
      !['active', 'paused', 'completed', 'cancelled'].includes(query.status)) ||
    (query.fromDate === null) !== (query.toDate === null)
  )
    throw new Error('Choose valid trip search filters.');
  if (query.fromDate !== null && query.toDate !== null)
    adminTripDateBounds({
      mode: 'range',
      date: query.fromDate,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
  const { data, error } = await supabase.rpc('search_admin_trips', {
    p_from_date: query.fromDate,
    p_to_date: query.toDate,
    p_status: query.status,
    p_page: query.page,
    p_page_size: query.pageSize,
  });
  if (error?.code === 'PGRST202' || error?.code === '42883') return searchExistingTrips(query);
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
