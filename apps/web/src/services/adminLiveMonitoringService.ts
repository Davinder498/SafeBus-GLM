import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { AdminLiveTrip, FleetIssueLabel, LocationFreshness } from '@/types/adminLiveMonitoring';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

interface AdminLiveFleetRpcRow {
  bus_label: string | null;
  route_name: string | null;
  driver_name: string | null;
  trip_type: string | null;
  status: string;
  started_at: string;
  latest_latitude: number | null;
  latest_longitude: number | null;
  latest_location_at: string | null;
  speed_mps: number | null;
  location_status: LocationFreshness | null;
  issue_label: FleetIssueLabel | null;
}

function normalizeLocationStatus(value: LocationFreshness | null): LocationFreshness {
  if (value === 'live' || value === 'stale' || value === 'missing') return value;
  return 'missing';
}

function normalizeIssueLabel(value: FleetIssueLabel | null, status: LocationFreshness): FleetIssueLabel {
  if (value === 'OK' || value === 'Stale GPS' || value === 'Missing GPS' || value === 'Speed unavailable' || value === 'Needs attention') {
    return value;
  }
  if (status === 'missing') return 'Missing GPS';
  if (status === 'stale') return 'Stale GPS';
  return 'Needs attention';
}

function mapRow(row: AdminLiveFleetRpcRow): AdminLiveTrip {
  const locationStatus = normalizeLocationStatus(row.location_status);
  return {
    busLabel: row.bus_label,
    routeName: row.route_name,
    driverName: row.driver_name,
    tripType: row.trip_type,
    status: row.status,
    startedAt: row.started_at,
    latestLatitude: row.latest_latitude,
    latestLongitude: row.latest_longitude,
    latestLocationAt: row.latest_location_at,
    speedMps: row.speed_mps,
    locationStatus,
    issueLabel: normalizeIssueLabel(row.issue_label, locationStatus),
  };
}

export async function fetchAdminLiveTrips(): Promise<AdminLiveTrip[]> {
  const client = requireSupabase();

  const { data, error } = await client.rpc('get_admin_live_fleet_monitoring');

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load admin live fleet monitoring', error);
    }
    throw new Error('Unable to load admin live fleet monitoring');
  }

  const rows = (data ?? []) as AdminLiveFleetRpcRow[];
  return rows.map(mapRow);
}
