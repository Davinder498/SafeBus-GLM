import { supabase, supabaseConfigError } from '@/lib/supabase';
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
  return (data ?? []) as Tenant[];
}

export async function getVisibleSchools(): Promise<School[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('schools')
    .select('id, tenant_id, name, city, province, status, created_at, updated_at')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as School[];
}

export async function getVisibleProfiles(): Promise<OrganizationProfile[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('id, tenant_id, school_id, first_name, last_name, full_name, email, role, status, created_at, updated_at')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as OrganizationProfile[];
}

export async function getVisibleDriverProfiles(): Promise<OrganizationProfile[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('id, tenant_id, school_id, first_name, last_name, full_name, email, role, status, created_at, updated_at')
    .eq('role', 'driver')
    .order('full_name', { ascending: true })
    .limit(250);
  if (error) throw new Error(error.message);
  return (data ?? []) as OrganizationProfile[];
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
  return data as Tenant | null;
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
  return data as School | null;
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
