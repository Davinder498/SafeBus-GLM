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

export interface AuthoritySearchPage {
  items: AuthorityReference[];
  total: number;
  nextOffset: number | null;
}

export async function searchAuthorityDirectory(
  query: string,
  offset = 0,
): Promise<AuthoritySearchPage> {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  if (query.trim().length < 2) return { items: [], total: 0, nextOffset: null };
  const { data, error } = await supabase.rpc('search_authority_reference_directory_v2', {
    p_query: query.trim(),
    p_offset: offset,
  });
  if (error)
    throw new Error('Authority search is unavailable. You can enter the details manually.');
  return data as unknown as AuthoritySearchPage;
}
