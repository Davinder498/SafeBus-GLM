import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@safebus/types/database';

export type SafeBusSupabaseClient = SupabaseClient<Database>;

export const supabaseEnv = {
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
};

export const supabaseConfigError =
  !supabaseEnv.url || !supabaseEnv.anonKey
    ? 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your local environment.'
    : null;

function createSupabaseClient(): SafeBusSupabaseClient | null {
  if (supabaseConfigError || !supabaseEnv.url || !supabaseEnv.anonKey) {
    return null;
  }

  return createClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase = createSupabaseClient();
