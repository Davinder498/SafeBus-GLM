import type { SafeBusSupabaseClient } from './supabase-client.ts';

/**
 * Compile-only assertions that prove the shared client is constrained by the
 * generated schema. This file emits no runtime code.
 */
export async function assertGeneratedDatabaseContract(
  client: SafeBusSupabaseClient,
): Promise<void> {
  client.from('students').select('id, tenant_id');
  await client.rpc('current_user_role');

  // @ts-expect-error A table absent from the hosted schema must be rejected.
  client.from('not_a_safebus_table');
  // @ts-expect-error An RPC absent from the hosted schema must be rejected.
  await client.rpc('not_a_safebus_function');

  const response = await client.rpc('get_admin_dashboard_overview');
  // @ts-expect-error OpenAPI does not disclose RPC result shapes; callers must narrow them.
  const unsafeResult: string = response.data;
  void unsafeResult;
}
