import { supabase, supabaseConfigError } from '@/lib/supabase';
import type {
  AdminTripDirection,
  AdminTripOverviewItem,
  AdminTripStatus,
} from '@/types/adminTripOverview';

interface AdminTripOverviewRpcRow {
  trip_id: string;
  service_date: string;
  status: AdminTripStatus;
  started_at: string;
  ended_at: string | null;
  route_name: string;
  route_code: string;
  trip_pattern_name: string;
  direction: 'forward' | 'reverse';
  bus_label: string;
  driver_label: string;
}

export function directionLabel(direction: AdminTripDirection): 'Outbound' | 'Return' {
  return direction === 'outbound' ? 'Outbound' : 'Return';
}

function mapDirection(direction: AdminTripOverviewRpcRow['direction']): AdminTripDirection {
  return direction === 'reverse' ? 'return' : 'outbound';
}

export async function fetchAdminTripOverview(limit = 50): Promise<AdminTripOverviewItem[]> {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');

  const { data, error } = await supabase.rpc('get_admin_trip_overview', { p_limit: limit });
  if (error) throw new Error('Unable to load trip summaries. Please try again.');

  return ((data ?? []) as AdminTripOverviewRpcRow[]).map((row) => ({
    id: row.trip_id,
    serviceDate: row.service_date,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    routeName: row.route_name,
    routeCode: row.route_code,
    tripPatternName: row.trip_pattern_name,
    direction: mapDirection(row.direction),
    busLabel: row.bus_label,
    driverLabel: row.driver_label,
  }));
}
