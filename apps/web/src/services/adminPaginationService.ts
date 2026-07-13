import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { AdminListQuery, PaginatedResult } from '@/types/pagination';

export type AdminListEntity =
  | 'students'
  | 'guardians'
  | 'student_assignments'
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
  id: string; student_id: string; student_name: string; relationship: string; status: string;
}

function requireSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export async function fetchAdminPage<T>(
  entity: AdminListEntity,
  query: AdminListQuery,
): Promise<PaginatedResult<T>> {
  const { data, error } = await requireSupabase().rpc('get_admin_paginated_list', {
    p_entity: entity,
    p_page: query.page,
    p_page_size: query.pageSize,
    p_search: query.search?.trim() ?? '',
    p_status: query.status || null,
    p_school_id: query.schoolId || null,
  });
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
  const { data, error } = await requireSupabase().rpc('get_admin_guardian_links', { p_guardian_id: guardianId });
  if (error) throw new Error('Unable to load linked students.');
  return (data ?? []) as GuardianLinkSummary[];
}
