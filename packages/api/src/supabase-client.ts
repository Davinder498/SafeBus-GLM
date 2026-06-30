/**
 * SafeBus Alberta — Supabase client factory.
 *
 * Creates a typed Supabase client. The URL and anon key are read from
 * environment variables. Each app (web, mobile) provides its own env.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface CreateSupabaseClientOptions {
  url: string;
  anonKey: string;
  /** Custom fetch implementation (useful for tests / React Native). */
  fetch?: typeof fetch;
  /** Storage implementation for auth persistence (AsyncStorage on mobile). */
  storage?: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  };
}

export function createSupabaseClient(options: CreateSupabaseClientOptions): SupabaseClient {
  const { url, anonKey, fetch: customFetch, storage } = options;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase URL and anon key are required. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ' +
        '(web) or EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (mobile).',
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: storage as never,
    },
    global: {
      fetch: customFetch,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

export type { SupabaseClient };
