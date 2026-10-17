import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { AdminListQuery, PaginatedResult } from '@/types/pagination';

export type AdminListEntity =
  | 'students'
  | 'guardians'
  | 'student_assignments'
  | 'student_bus_assignments'
  | 'driver_assignments'
  | 'drivers'
  | 'buses'
  | 'routes';

export interface StudentSearchOption {
  id: string;
  label: string;
  school_name: string | null;
}

export interface GuardianLinkSummary {
  id: string;
  student_id: string;
  student_name: string;
  relationship: string;
  status: string;
  access_expires_at: string | null;
}

function requireSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export async function fetchAdminPage<T>(
  entity: AdminListEntity,
  query: AdminListQuery,
  signal?: AbortSignal,
): Promise<PaginatedResult<T>> {
  const client = requireSupabase();
  const rpcArguments = {
    p_page: query.page,
    p_page_size: query.pageSize,
    p_search: query.search?.trim() ?? '',
    p_status: query.status || null,
    p_school_id: query.schoolId || null,
  };
  const initialRequest =
    entity === 'students'
      ? client.rpc('get_admin_students_page', rpcArguments)
      : entity === 'student_bus_assignments'
        ? client.rpc('get_admin_student_bus_assignments_page', {
            p_page: query.page,
            p_page_size: query.pageSize,
            p_search: query.search?.trim() ?? '',
            p_status: query.status || null,
          })
        : entity === 'buses'
          ? client.rpc('get_admin_buses_page', rpcArguments)
          : client.rpc('get_admin_paginated_list', {
              p_entity: entity,
              ...rpcArguments,
            });

  let { data, error } = await (signal ? initialRequest.abortSignal(signal) : initialRequest);

  // Keep the bus directory available while the fleet-number migration moves
  // through the protected production adoption workflow. The generic RPC is the
  // pre-migration, tenant-scoped implementation and does not bypass RLS.
  if (entity === 'buses' && (error?.code === 'PGRST202' || error?.code === '42883')) {
    const fallbackRequest = client.rpc('get_admin_paginated_list', {
      p_entity: entity,
      ...rpcArguments,
    });
    ({ data, error } = await (signal ? fallbackRequest.abortSignal(signal) : fallbackRequest));
  }

  if (error) throw new Error('Unable to load this list.');
  const result = data as unknown as PaginatedResult<T>;
  return { ...result, rows: result?.rows ?? [], totalCount: result?.totalCount ?? 0 };
}

export async function searchAdminStudents(search: string): Promise<StudentSearchOption[]> {
  if (search.trim().length < 2) return [];
  const { data, error } = await requireSupabase().rpc('search_admin_students', {
    p_search: search.trim(),
    p_limit: 20,
  });
  if (error) throw new Error('Unable to search students.');
  return (data ?? []) as StudentSearchOption[];
}

export async function fetchAdminGuardianLinks(guardianId: string): Promise<GuardianLinkSummary[]> {
  const { data, error } = await requireSupabase().rpc('get_admin_guardian_links', {
    p_guardian_id: guardianId,
  });
  if (error) throw new Error('Unable to load linked students.');
  return (data ?? []) as GuardianLinkSummary[];
}
