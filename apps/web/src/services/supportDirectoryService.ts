import { supabase, supabaseConfigError } from '@/lib/supabase';

export interface SupportContact {
  displayName: string;
  email: string;
  phone: string | null;
  websiteUrl: string | null;
  supportHours: string | null;
  instructions: string | null;
  updatedAt: string;
}

export interface SupportDirectory {
  platform: SupportContact | null;
  tenant: SupportContact | null;
}

export type SupportContactInput = Omit<SupportContact, 'updatedAt'>;

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export async function fetchSupportDirectory(): Promise<SupportDirectory> {
  const { data, error } = await client().rpc('get_support_directory');
  if (error) throw new Error('We could not load support details. Please try again.');
  const value = (data ?? {}) as Partial<SupportDirectory>;
  return { platform: value.platform ?? null, tenant: value.tenant ?? null };
}

function args(input: SupportContactInput) {
  return {
    p_display_name: input.displayName.trim(),
    p_email: input.email.trim(),
    p_phone: input.phone?.trim() || null,
    p_website_url: input.websiteUrl?.trim() || null,
    p_support_hours: input.supportHours?.trim() || null,
    p_instructions: input.instructions?.trim() || null,
  };
}

export async function updatePlatformSupportContact(input: SupportContactInput): Promise<void> {
  const { error } = await client().rpc('update_platform_support_contact', args(input));
  if (error) throw new Error('Platform support details were not saved.');
}

export async function updateTenantSupportContact(input: SupportContactInput): Promise<void> {
  const { error } = await client().rpc('update_tenant_support_contact', args(input));
  if (error) throw new Error('Tenant support details were not saved.');
}
