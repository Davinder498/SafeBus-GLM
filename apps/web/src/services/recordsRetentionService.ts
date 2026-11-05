import { supabase } from '@/lib/supabase';
export interface RetentionRule {
  data_class: string;
  label: string;
  scope: string;
  days: number | null;
  method: string;
  trigger_description: string;
}
export interface RecordHold {
  id: string;
  tenant_id: string | null;
  data_class: string;
  record_id: string | null;
  window_start: string | null;
  window_end: string | null;
  reference: string;
  reason: string;
  minimum_until: string;
  review_at: string;
  state: string;
  created_at: string;
}
export interface RecordExport {
  id: string;
  tenant_id: string | null;
  data_class: string;
  reference: string;
  requested_by: string;
  record_id: string | null;
  window_start: string | null;
  window_end: string | null;
  state: string;
  created_at: string;
  expires_at: string;
  row_count: number;
}
export interface RetentionOverview {
  rules: RetentionRule[];
  holds: RecordHold[];
  exports: RecordExport[];
  automaticDisposalEnabled: boolean;
  workerConfigured: boolean;
  executionRequested: boolean;
  execution: { completedAt: string; runCount: number; counts: Record<string, number> } | null;
}
export interface BusinessRecord {
  id: string;
  data_class: string;
  reference: string;
  source_type: string;
  provider: string | null;
  classification: string;
  created_at: string;
  resolved_at: string | null;
  fiscal_year_end: string | null;
  late_filed_at: string | null;
  minimum_until: string | null;
  review_at: string | null;
  continuing_relationship: boolean;
  eligible_at: string | null;
  disposal_state: string;
  object_key: string | null;
}
export interface RecordOption {
  id: string;
  recordedAt: string;
  label: string;
}
export interface ExportChunk {
  id: string;
  created_at: string;
  row_count: number;
}
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export async function recordsRequest(
  action: string,
  data: Record<string, unknown> = {},
): Promise<unknown> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('Sign in to manage records.');
  let response: Response;
  try {
    response = await fetch('/.netlify/functions/records-retention', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, data }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('Records management could not be reached. Refresh before retrying.');
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error(
      'Records management returned an unreadable response. No completion is confirmed.',
    );
  }
  const body = record(raw);
  if (!response.ok)
    throw new Error(
      typeof body.error === 'string' ? body.error : 'Records management is unavailable.',
    );
  if (!('result' in body)) throw new Error('Invalid records response.');
  return body.result;
}
function rows<T>(value: unknown, keys: string[]): T[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (v) => v && typeof v === 'object' && keys.every((k) => typeof record(v)[k] === 'string'),
    )
  )
    throw new Error('Invalid records response.');
  return value as T[];
}
export async function getRetentionOverview(
  data: Record<string, string> = {},
): Promise<RetentionOverview> {
  const value = record(await recordsRequest('overview', data));
  const rules = rows<RetentionRule>(value.rules, [
    'data_class',
    'label',
    'scope',
    'method',
    'trigger_description',
  ]);
  if (!rules.every((r) => r.days === null || Number.isSafeInteger(r.days)))
    throw new Error('Invalid retention policy response.');
  return {
    rules,
    holds: rows<RecordHold>(value.holds, [
      'id',
      'data_class',
      'reference',
      'minimum_until',
      'review_at',
      'state',
      'created_at',
    ]),
    exports: rows<RecordExport>(value.exports, [
      'id',
      'data_class',
      'reference',
      'requested_by',
      'state',
      'created_at',
      'expires_at',
    ]),
    automaticDisposalEnabled: value.automaticDisposalEnabled === true,
    workerConfigured: value.workerConfigured === true,
    executionRequested: value.executionRequested === true,
    execution:
      value.execution && typeof value.execution === 'object'
        ? (value.execution as RetentionOverview['execution'])
        : null,
  };
}
export async function getRecordOptions(
  dataClass: string,
  search: string,
  afterId?: string,
): Promise<RecordOption[]> {
  return rows<RecordOption>(
    await recordsRequest('records', { dataClass, search, ...(afterId ? { afterId } : {}) }),
    ['id', 'recordedAt', 'label'],
  );
}
export async function getBusinessRecords(
  data: Record<string, string> = {},
): Promise<BusinessRecord[]> {
  return rows<BusinessRecord>(await recordsRequest('business_records', data), [
    'id',
    'data_class',
    'reference',
    'source_type',
    'classification',
    'created_at',
    'disposal_state',
  ]);
}
export async function getExportChunks(id: string, cursor?: ExportChunk): Promise<ExportChunk[]> {
  const result = record(
    await recordsRequest('export_chunks', {
      id,
      ...(cursor ? { after: cursor.created_at, afterId: cursor.id } : {}),
    }),
  );
  return rows<ExportChunk>(result.chunks, ['id', 'created_at']);
}
export function saveJson(value: unknown, filename: string) {
  saveBlob(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), filename);
}
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
