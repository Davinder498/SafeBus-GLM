import { supabase, supabaseConfigError } from '@/lib/supabase';

export interface AuthorityReference {
  authorityCode: string;
  officialName: string;
  aliases?: string[];
  authorityCategory: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  email: string | null;
  phone: string | null;
  websiteUrl: string | null;
  sourceExtractDate: string;
  importedAt: string;
  sourceUrl: string;
  alreadyLinked: boolean;
}

export async function searchAuthorityDirectory(query: string): Promise<AuthorityReference[]> {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  if (query.trim().length < 2) return [];
  const { data, error } = await supabase.rpc('search_authority_reference_directory', {
    p_query: query.trim(),
  });
  if (error)
    throw new Error('Authority search is unavailable. You can enter the details manually.');
  return (data ?? []) as unknown as AuthorityReference[];
}
