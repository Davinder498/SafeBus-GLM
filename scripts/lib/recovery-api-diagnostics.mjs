import { setTimeout as delay } from 'node:timers/promises';

// Inspect provider text in memory; return only fixed local codes, never its payload.
export function channelFailureCode(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (
    /MissingPartition|Realtime was unable to find the expected messages partition|no partition of relation ["']?messages["']? found/i.test(
      message,
    )
  )
    return 'CHANNEL_MISSING_PARTITION';
  if (/permission|authoriz|not allowed/i.test(message)) return 'CHANNEL_AUTHORIZATION_DENIED';
  return 'CHANNEL_TRANSPORT_ERROR';
}

// Supabase creates managed message partitions on the first connection. Retry only
// that explicit startup error. Every attempt removes its channel in finally.
export async function withRealtimeStartupRetry(operation, wait = delay) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error?.message !== 'CHANNEL_MISSING_PARTITION' || attempt >= 2) throw error;
      await wait(1500 * (attempt + 1));
    }
  }
}

const safeCodes = new Set([
  'AUTH_OPERATION_FAILED',
  'AUTH_ORIGIN_REJECTED',
  'AUTH_SETTINGS_NOT_ISOLATED',
  'AUTH_SETTINGS_UNAVAILABLE',
  'CHANNEL_AUTHORIZATION_DENIED',
  'CHANNEL_MISSING_PARTITION',
  'CHANNEL_SCOPE_MISMATCH',
  'CHANNEL_TIMEOUT',
  'CHANNEL_TRANSPORT_ERROR',
  'CLEANUP_INCOMPLETE',
  'CLEANUP_SCOPE_MISMATCH',
  'CROSS_TENANT_LEAK',
  'DELIVERY_TIMEOUT',
  'BROADCAST_REPLICATION_NOT_READY',
  'BROADCAST_INSERT_NOT_CONFIRMED',
  'DEPLOYMENT_BUSY',
  'EMPTY_ISOLATED_BASELINE_REQUIRED',
  'EXPECTED_API_DENIAL',
  'HOOK_CHANGED',
  'LOGIN_IDENTITY_MISMATCH',
  'MFA_FAILED',
  'POLICIES_CHANGED',
  'PROFILE_SCOPE_MISMATCH',
  'PROTECTED_WORKFLOW_REQUIRED',
  'QUARANTINE_CHANGED',
  'RETIRED_ROLE_ACCEPTED',
  'SESSION_CONNECTION_REQUIRED',
  'TENANT_SCOPE_MISMATCH',
  'USER_CREATION_FAILED',
]);
export function safeFailureCode(error) {
  return safeCodes.has(error?.message) ? error.message : 'UNCLASSIFIED_FAILURE';
}
