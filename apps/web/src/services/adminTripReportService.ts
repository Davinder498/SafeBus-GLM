import { supabase, supabaseConfigError } from '@/lib/supabase';
import { AdminTripAccessError } from './adminTripDetailService';
import { mapAdminTripOverviewRow } from './adminTripOverviewService';
import { adminTripDateBounds } from '@/utils/adminTripDates';
import { TRIP_EXCEPTION_TYPES } from '@/types/tripExceptions';
import type { AdminTripEvidence, AdminTripReportQuery } from '@/types/adminTripReport';
import type { PaginatedResult } from '@/types/pagination';
import type { AdminTripStatus } from '@/types/adminTripOverview';

const accessError = () =>
  new AdminTripAccessError(
    'Trip access is unavailable. Check your session and administrator permissions.',
  );
const loadError = () => new Error('Unable to load recorded trip evidence. Please try again.');
const tripSelection = `trip:driver_trips!inner(
  id,tenant_id,route_id,service_date,status,started_at,ended_at,trip_name_snapshot,bus_number_snapshot,
  route:routes!driver_trips_route_id_fkey!inner(route_name,route_code,tenant_id),
  pattern:route_trip_patterns!driver_trips_route_trip_pattern_id_fkey!inner(display_name,direction,route_id,tenant_id),
  bus:buses!driver_trips_bus_id_fkey!inner(bus_number,tenant_id),
  driver:drivers!driver_trips_driver_id_fkey!inner(tenant_id,
    profile:profiles!drivers_profile_id_fkey!inner(full_name,tenant_id)))`;

/** Read existing records through caller RLS, after the existing trip RPC verifies
 * the active authority/session and administrator MFA server-side.
 * The inner trip join prevents evidence without an authorized trip from appearing.
 * No aggregate fan-out, page-local filtering, or service credentials are used.
 */
async function searchEvidence(
  query: AdminTripReportQuery,
  kind: 'exceptions' | 'dispatch',
  signal?: AbortSignal,
): Promise<PaginatedResult<AdminTripEvidence>> {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  if (
    !Number.isSafeInteger(query.page) ||
    query.page < 1 ||
    query.page > 2_147_483_647 ||
    ![25, 50, 100].includes(query.pageSize) ||
    (query.fromDate === null) !== (query.toDate === null) ||
    (query.status !== null &&
      !['active', 'paused', 'completed', 'cancelled', 'ongoing'].includes(query.status)) ||
    (query.exceptionType !== null &&
      !TRIP_EXCEPTION_TYPES.some((t) => t.value === query.exceptionType)) ||
    (query.flag !== null && !['late', 'missing'].includes(query.flag))
  )
    throw new Error('Choose valid trip report filters.');
  if (query.fromDate !== null && query.toDate !== null)
    adminTripDateBounds({
      mode: 'range',
      date: query.fromDate,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
  const client = supabase;
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) throw accessError();
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role,tenant_id,status')
    .eq('id', identity.user.id)
    .abortSignal(signal ?? new AbortController().signal)
    .single();
  if (
    profileError ||
    !profile ||
    profile.status !== 'active' ||
    !profile.tenant_id ||
    !['tenant_admin', 'transportation_admin'].includes(profile.role)
  )
    throw accessError();
  const { data: mfa, error: mfaError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError || mfa?.currentLevel !== 'aal2') throw accessError();
  signal?.throwIfAborted();

  // A reserved, nonexistent trip ID checks the existing RPC's authorization guard
  // without fetching a roster. Do not treat a browser AAL check as server enforcement.
  // The separately reported legacy table-level MFA gap remains a release dependency.
  const { error: authorizationError } = await client
    .rpc('get_admin_trip_detail', {
      p_trip_id: '00000000-0000-0000-0000-000000000000',
    })
    .abortSignal(signal ?? new AbortController().signal);
  if (authorizationError) {
    if (['42501', 'PGRST301', 'PGRST303'].includes(authorizationError.code)) throw accessError();
    throw loadError();
  }
  signal?.throwIfAborted();

  const selection =
    kind === 'exceptions'
      ? `id,tenant_id,driver_trip_id,exception_type,occurred_at,${tripSelection}`
      : `id,tenant_id,driver_trip_id,operational_status,reason_code,set_at,${tripSelection}`;
  let request = (
    kind === 'exceptions'
      ? client.from('trip_exceptions').select(selection, { count: 'exact' })
      : client.from('trip_operational_statuses').select(selection, { count: 'exact' })
  )
    .eq('tenant_id', profile.tenant_id)
    .eq('trip.tenant_id', profile.tenant_id)
    .eq('trip.route.tenant_id', profile.tenant_id)
    .eq('trip.pattern.tenant_id', profile.tenant_id)
    .eq('trip.bus.tenant_id', profile.tenant_id)
    .eq('trip.driver.tenant_id', profile.tenant_id)
    .eq('trip.driver.profile.tenant_id', profile.tenant_id);
  if (query.fromDate) request = request.gte('trip.service_date', query.fromDate);
  if (query.toDate) request = request.lte('trip.service_date', query.toDate);
  if (query.status === 'ongoing') request = request.in('trip.status', ['active', 'paused']);
  else if (query.status) request = request.eq('trip.status', query.status);
  if (kind === 'exceptions' && query.exceptionType)
    request = request.filter('exception_type', 'eq', query.exceptionType);
  if (kind === 'dispatch')
    request = request.in('operational_status', query.flag ? [query.flag] : ['late', 'missing']);
  const offset = (query.page - 1) * query.pageSize;
  const { data, count, error } = await request
    .order(kind === 'exceptions' ? 'occurred_at' : 'set_at', { ascending: false })
    .order('id', { ascending: true })
    .range(offset, offset + query.pageSize - 1)
    .abortSignal(signal ?? new AbortController().signal);
  if (error) {
    if (['42501', 'PGRST301', 'PGRST303'].includes(error.code)) throw accessError();
    throw loadError();
  }
  if (
    !Array.isArray(data) ||
    !Number.isSafeInteger(count) ||
    count! < 0 ||
    data.length > query.pageSize
  )
    throw loadError();
  // Dynamic selection varies by source table; validate the wire shape before use.
  const rows = data.map((value: unknown): AdminTripEvidence => {
    if (!value || typeof value !== 'object') throw loadError();
    const row = value as EvidenceRow;
    const t = row.trip;
    if (
      !t ||
      row.tenant_id !== profile.tenant_id ||
      row.driver_trip_id !== t.id ||
      [
        t.tenant_id,
        t.route?.tenant_id,
        t.pattern?.tenant_id,
        t.bus?.tenant_id,
        t.driver?.tenant_id,
        t.driver?.profile?.tenant_id,
      ].some((id) => id !== profile.tenant_id) ||
      t.pattern.route_id !== t.route_id ||
      !['active', 'paused', 'completed', 'cancelled'].includes(t.status) ||
      !['forward', 'reverse'].includes(t.pattern.direction) ||
      typeof row.id !== 'string' ||
      typeof t.started_at !== 'string' ||
      typeof t.service_date !== 'string' ||
      typeof (kind === 'exceptions' ? row.exception_type : row.operational_status) !== 'string' ||
      typeof (kind === 'exceptions' ? row.occurred_at : row.set_at) !== 'string'
    )
      throw loadError();
    return {
      id: row.id,
      category: kind === 'exceptions' ? row.exception_type! : row.operational_status!,
      recordedAt: kind === 'exceptions' ? row.occurred_at! : row.set_at!,
      reason: kind === 'dispatch' ? (row.reason_code ?? null) : null,
      trip: mapAdminTripOverviewRow({
        trip_id: t.id,
        service_date: t.service_date,
        status: t.status,
        started_at: t.started_at,
        ended_at: t.ended_at,
        route_name: t.route.route_name,
        route_code: t.route.route_code,
        trip_pattern_name: t.trip_name_snapshot ?? t.pattern.display_name,
        direction: t.pattern.direction,
        bus_label: t.bus_number_snapshot ?? t.bus.bus_number,
        driver_label: t.driver.profile.full_name ?? 'Not recorded',
      }),
    };
  });
  return { rows, totalCount: count!, page: query.page, pageSize: query.pageSize };
}

interface EvidenceRow {
  id: string;
  tenant_id: string;
  driver_trip_id: string;
  exception_type?: string;
  operational_status?: string;
  occurred_at?: string;
  set_at?: string;
  reason_code?: string | null;
  trip: {
    id: string;
    tenant_id: string;
    route_id: string;
    service_date: string;
    status: AdminTripStatus;
    started_at: string;
    ended_at: string | null;
    trip_name_snapshot: string | null;
    bus_number_snapshot: string | null;
    route: { tenant_id: string; route_name: string; route_code: string };
    pattern: {
      tenant_id: string;
      route_id: string;
      display_name: string;
      direction: 'forward' | 'reverse';
    };
    bus: { tenant_id: string; bus_number: string };
    driver: { tenant_id: string; profile: { tenant_id: string; full_name: string | null } };
  };
}
export const searchAdminTripExceptions = (query: AdminTripReportQuery, signal?: AbortSignal) =>
  searchEvidence(query, 'exceptions', signal);
export const searchAdminTripDispatchFlags = (query: AdminTripReportQuery, signal?: AbortSignal) =>
  searchEvidence(query, 'dispatch', signal);
