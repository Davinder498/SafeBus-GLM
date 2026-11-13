import { collectVisibleRows, collectVisibleIds } from './visibleRows';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import { safeBusDisplayText } from '@/utils/brand';
import type {
  OrganizationContext,
  OrganizationProfile,
  School,
  Tenant,
} from '@/types/organization';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }

  return supabase;
}

export async function getVisibleTenants(): Promise<Tenant[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('tenants')
    .select('id, name, type, status, created_at, updated_at')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, name: safeBusDisplayText(row.name) })) as Tenant[];
}

export async function getVisibleSchools(options?: {
  includeArchived?: boolean;
}): Promise<School[]> {
  const rows = await collectVisibleRows<School>((from, to) => {
    let request = requireSupabase().from('schools')
      .select('id, tenant_id, name, city, province, status, created_at, updated_at');
    if (!options?.includeArchived) request = request.eq('status', 'active');
    return request.order('name').order('id').range(from, to);
  });
  return rows.map((row) => ({ ...row, name: safeBusDisplayText(row.name) }));
}

export interface SchoolDetailsInput {
  name: string;
  city?: string | null;
}

export async function createTenantSchool(input: SchoolDetailsInput): Promise<School> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('tenant_create_school', {
    p_name: input.name,
    p_city: input.city ?? null,
  });

  if (error || !data) throw new Error(error?.message ?? 'Unable to add the school.');
  return data as School;
}

export async function updateTenantSchool(
  schoolId: string,
  input: SchoolDetailsInput,
): Promise<School> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('tenant_update_school', {
    p_school_id: schoolId,
    p_name: input.name,
    p_city: input.city ?? null,
  });

  if (error || !data) throw new Error(error?.message ?? 'Unable to update the school.');
  return data as School;
}

export async function archiveTenantSchool(schoolId: string): Promise<School> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('tenant_archive_school', {
    p_school_id: schoolId,
  });

  if (error || !data) throw new Error(error?.message ?? 'Unable to delete the school.');
  return data as School;
}

export async function restoreTenantSchool(schoolId: string): Promise<School> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('tenant_restore_school', {
    p_school_id: schoolId,
  });

  if (error || !data) throw new Error(error?.message ?? 'Unable to restore the school.');
  return data as School;
}

export async function getVisibleProfiles(ids?: string[]): Promise<OrganizationProfile[]> {
  const load = (chunk?: string[]) => collectVisibleRows<OrganizationProfile>((from, to) => {
    let request = requireSupabase().from('profiles').select(
      'id, tenant_id, school_id, first_name, last_name, full_name, email, role, status, created_at, updated_at');
    if (chunk) request = request.in('id', chunk);
    return request.order('full_name').order('id').range(from, to);
  });
  const rows = ids ? await collectVisibleIds(ids, load) : await load();
  return rows.map((row) => ({ ...row, full_name: row.full_name ? safeBusDisplayText(row.full_name) : row.full_name }));
}

export async function getVisibleDriverProfiles(): Promise<OrganizationProfile[]> {
  const client = requireSupabase();
  return collectVisibleRows<OrganizationProfile>((from, to) => client
    .from('profiles')
    .select('id, tenant_id, school_id, first_name, last_name, full_name, email, role, status, created_at, updated_at')
    .eq('role', 'driver')
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to));
}

export async function getCurrentTenant(tenantId: string | null): Promise<Tenant | null> {
  if (!tenantId) return null;

  const client = requireSupabase();
  const { data, error } = await client
    .from('tenants')
    .select('id, name, type, status, created_at, updated_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? ({ ...data, name: safeBusDisplayText(data.name) } as Tenant) : null;
}

export async function getCurrentSchool(schoolId: string | null): Promise<School | null> {
  if (!schoolId) return null;

  const client = requireSupabase();
  const { data, error } = await client
    .from('schools')
    .select('id, tenant_id, name, city, province, status, created_at, updated_at')
    .eq('id', schoolId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? ({ ...data, name: safeBusDisplayText(data.name) } as School) : null;
}

export async function getOrganizationContext(
  tenantId: string | null,
  schoolId: string | null,
): Promise<OrganizationContext> {
  const [tenant, school] = await Promise.all([
    getCurrentTenant(tenantId),
    getCurrentSchool(schoolId),
  ]);

  return { tenant, school };
}
