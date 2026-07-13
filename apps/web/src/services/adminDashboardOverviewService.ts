import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { Route } from '@/types/transportation';

export interface AdminOverviewRoute extends Route {
  stop_count: number;
  active_assignment_count: number;
  priority: number;
}

export async function fetchBoundedAdminOverview(): Promise<{ routes: AdminOverviewRoute[] }> {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  const { data, error } = await supabase.rpc('get_admin_dashboard_overview');
  if (error || !data) throw new Error('Unable to load the transportation overview.');
  const result = data as unknown as { routes?: AdminOverviewRoute[] };
  return { routes: result.routes ?? [] };
}
