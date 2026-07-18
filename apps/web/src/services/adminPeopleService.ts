import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { OrganizationProfile } from '@/types/organization';
import type { Guardian } from '@/types/studentGuardian';
import type { Driver } from '@/types/transportation';

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

const guardianColumns =
  'id, tenant_id, profile_id, first_name, last_name, full_name, email, phone, status, created_at, updated_at';
const driverColumns =
  'id, tenant_id, profile_id, employee_number, phone, license_number, license_issue_date, license_expiry_date, license_class, address_line1, address_line2, city, province, postal_code, status, created_at, updated_at';
const profileColumns =
  'id, tenant_id, school_id, first_name, last_name, full_name, email, role, status, created_at, updated_at';

export interface AdminGuardianDetail {
  guardian: Guardian;
  profile: OrganizationProfile | null;
}

export interface AdminDriverDetail {
  driver: Driver;
  profile: OrganizationProfile;
}

export async function fetchAdminGuardianDetail(
  guardianId: string,
): Promise<AdminGuardianDetail> {
  const { data: guardianData, error: guardianError } = await client()
    .from('guardians')
    .select(guardianColumns)
    .eq('id', guardianId)
    .maybeSingle();

  if (guardianError || !guardianData) throw new Error('This guardian is not available.');
  const guardian = guardianData as Guardian;
  const { data: profileData, error: profileError } = await client()
    .from('profiles')
    .select(profileColumns)
    .eq('id', guardian.profile_id)
    .maybeSingle();
  if (profileError) throw new Error('The guardian account details could not be loaded.');

  return {
    guardian,
    profile: (profileData as OrganizationProfile | null) ?? null,
  };
}

export async function fetchAdminDriverDetail(driverId: string): Promise<AdminDriverDetail> {
  const { data: driverData, error: driverError } = await client()
    .from('drivers')
    .select(driverColumns)
    .eq('id', driverId)
    .maybeSingle();
  if (driverError || !driverData) throw new Error('This driver is not available.');

  const driver = driverData as Driver;
  const { data: profileData, error: profileError } = await client()
    .from('profiles')
    .select(profileColumns)
    .eq('id', driver.profile_id)
    .maybeSingle();
  if (profileError || !profileData) throw new Error('The driver account details could not be loaded.');

  return { driver, profile: profileData as OrganizationProfile };
}
