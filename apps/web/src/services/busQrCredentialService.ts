import { supabase, supabaseConfigError } from '@/lib/supabase';

export type BusQrCredentialAction = 'generate' | 'rotate' | 'revoke';

interface BusQrCredentialRow {
  bus_id: string;
  credential_id: string | null;
  status: string;
  raw_token: string | null;
  created_at: string;
}

interface BusQrCredentialStatusRow {
  bus_id: string;
  has_active_credential: boolean;
  credential_status: string | null;
  credential_created_at: string | null;
}

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export async function manageBusQrCredential(busId: string, action: BusQrCredentialAction) {
  const { data, error } = await client().rpc('manage_bus_qr_credential', {
    p_bus_id: busId,
    p_action: action,
  });
  if (error) throw new Error(error.message || 'Unable to manage this bus QR credential.');
  const row = ((data ?? []) as BusQrCredentialRow[])[0];
  return {
    rawToken: row?.raw_token ?? null,
    status: row?.status ?? (action === 'revoke' ? 'revoked' : 'active'),
  };
}

export async function fetchBusQrCredentialStatus(busId: string) {
  const { data, error } = await client().rpc('get_admin_bus_qr_credential_status', {
    p_bus_id: busId,
  });
  if (error) throw new Error('Unable to load this bus QR credential status.');
  const row = ((data ?? []) as BusQrCredentialStatusRow[])[0];
  return row
    ? {
        hasActiveCredential: row.has_active_credential,
        createdAt: row.credential_created_at,
      }
    : null;
}
