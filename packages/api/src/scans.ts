/**
 * SafeBus Alberta — QR scan + manual override helpers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ManualOverrideRequest,
  ManualOverrideResponse,
  ScanRequest,
  ScanResponse,
} from '@safebus/types';
import { scanRequestSchema, manualOverrideSchema } from './validation.ts';
import { ValidationError, toSafeBusError } from './errors.ts';

export async function submitScan(
  supabase: SupabaseClient,
  request: ScanRequest,
): Promise<ScanResponse> {
  const parsed = scanRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw new ValidationError('Invalid scan request', parsed.error.flatten().fieldErrors as never);
  }

  const { data, error } = await supabase.functions.invoke<ScanResponse>('process-scan', {
    body: parsed.data,
  });

  if (error) throw toSafeBusError(error);
  return data as ScanResponse;
}

export async function submitManualOverride(
  supabase: SupabaseClient,
  request: ManualOverrideRequest,
): Promise<ManualOverrideResponse> {
  const parsed = manualOverrideSchema.safeParse(request);
  if (!parsed.success) {
    throw new ValidationError('Invalid manual override', parsed.error.flatten().fieldErrors as never);
  }

  const { data, error } = await supabase.functions.invoke<ManualOverrideResponse>(
    'process-scan',
    { body: { ...parsed.data, isManual: true } },
  );

  if (error) throw toSafeBusError(error);
  return data as ManualOverrideResponse;
}
