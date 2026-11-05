import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServerClients, json } from './billing-shared.mjs';
import {
  archiveKeys,
  encryptArchive,
  decryptArchive,
  ARCHIVE_BUCKET,
} from './retention-archive.mjs';

const actions = new Set([
  'overview',
  'records',
  'hold_create',
  'hold_review',
  'hold_approve',
  'hold_release',
  'export_create',
  'export_approve',
  'export_cancel',
  'export_chunks',
  'export_access',
  'business_records',
  'business_create',
  'business_update',
  'business_provider_confirm',
  'business_access',
  'business_upload',
  'business_download',
]);
const fields = new Set([
  'id',
  'dataClass',
  'tenantId',
  'recordId',
  'windowStart',
  'windowEnd',
  'confirmAll',
  'reference',
  'reason',
  'minimumUntil',
  'reviewAt',
  'decisionUsedAt',
  'confirm',
  'chunkId',
  'after',
  'afterId',
  'before',
  'beforeId',
  'sourceType',
  'provider',
  'sourceReference',
  'resolvedAt',
  'fiscalYearEnd',
  'lateFiledAt',
  'classification',
  'continuingRelationship',
  'evidenceReference',
  'attachment',
  'contentType',
  'search',
  'holdBefore',
  'holdBeforeId',
  'exportBefore',
  'exportBeforeId',
  'reopen',
]);
const mimeTypes = new Set(['application/pdf', 'text/plain', 'text/csv', 'application/json']);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  if ((event.body?.length || 0) > 1_500_000)
    return json(413, {
      error: 'The record request is too large. Attachments are limited to 1 MB.',
    });
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid records request.' });
  }
  if (
    !body ||
    !actions.has(body.action) ||
    !body.data ||
    typeof body.data !== 'object' ||
    Array.isArray(body.data) ||
    Object.keys(body).some((k) => !['action', 'data'].includes(k)) ||
    Object.keys(body.data).some((k) => !fields.has(k))
  )
    return json(400, { error: 'Invalid records request.' });
  for (const [key, value] of Object.entries(body.data)) {
    if (key === 'sourceReference') {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).some(
          (k) =>
            !['messageId', 'folderId', 'accountId', 'providerRecordId', 'evidenceId'].includes(k),
        ) ||
        Object.values(value).some(
          (v) => typeof v !== 'string' || !/^[A-Za-z0-9._/-]{1,200}$/.test(v),
        )
      )
        return json(400, {
          error: 'Use opaque provider references without names, message text or credentials.',
        });
    } else if (key === 'continuingRelationship' || key === 'reopen') {
      if (typeof value !== 'boolean')
        return json(400, { error: 'Invalid relationship selection.' });
    } else if (typeof value !== 'string') return json(400, { error: 'Invalid records field.' });
  }
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'Sign in required.' });
  try {
    const { user, admin } = createServerClients(auth.slice(7));
    const identity = await user.auth.getUser();
    if (identity.error || !identity.data.user) return json(401, { error: 'Sign in required.' });
    const rate = await user.rpc('check_rate_limit', {
      p_action: 'records_retention',
      p_actor_identifier: identity.data.user.id,
      p_max: 45,
      p_window_seconds: 60,
    });
    if (rate.error || rate.data !== true)
      return json(429, { error: 'Too many records requests. Try again shortly.' });
    const { attachment, contentType, ...data } = body.data;
    const action = ['business_upload', 'business_download'].includes(body.action)
      ? 'business_access'
      : body.action;
    const result = await user.rpc('manage_records_retention', { p_action: action, p_data: data });
    if (result.error) {
      if (['PGRST202', '42883'].includes(result.error.code))
        return json(503, {
          error:
            'Records management is awaiting its protected database release. No request was confirmed.',
        });
      if (result.error.code === '42501')
        return json(403, {
          error:
            'Current authority access and MFA are required. Sign in again before changing or downloading records.',
        });
      if (result.error.code === '55006')
        return json(409, {
          error:
            'Disposal has already started or a required retention period is active. Refresh before retrying.',
        });
      if (['22023', '22P02', '22007', '23502', '23514', '23503'].includes(result.error.code))
        return json(400, {
          error:
            'Check the class, reference, scope and dates. Finance needs its actual fiscal year end; case-specific records need a documented minimum.',
        });
      return json(503, {
        error:
          'Records management is temporarily unavailable. Refresh to confirm the current state before retrying.',
      });
    }
    if (body.action === 'overview')
      return json(200, {
        result: {
          ...result.data,
          workerConfigured: !!process.env.SAFEBUS_RETENTION_WORKER_TOKEN,
          executionRequested: process.env.SAFEBUS_RETENTION_LIFECYCLE_EXECUTE === 'true',
        },
      });
    if (body.action === 'export_access') {
      const chunk = result.data?.chunks?.find((c) => c.id === data.chunkId);
      if (!chunk || !/^exports\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.bin$/.test(chunk.object_key))
        return json(404, { error: 'Export chunk unavailable.' });
      const downloaded = await readVerified(
        admin,
        chunk.object_key,
        chunk.ciphertext_sha256,
        chunk.key_id,
      );
      if (downloaded.exportId !== data.id || downloaded.chunkId !== data.chunkId)
        throw new Error('INTEGRITY');
      return json(200, { result: downloaded });
    }
    if (body.action === 'business_upload') {
      const record = result.data;
      if (record.source_type !== 'managed_file' || record.object_key)
        return json(409, { error: 'This record does not accept a new attachment.' });
      if (
        typeof attachment !== 'string' ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment) ||
        !mimeTypes.has(contentType)
      )
        return json(400, { error: 'Upload a PDF, text, CSV or JSON file.' });
      const file = Buffer.from(attachment, 'base64');
      if (!file.length || file.length > 1_000_000)
        return json(413, { error: 'Attachments are limited to 1 MB.' });
      const keys = archiveKeys();
      const plain = Buffer.from(
        JSON.stringify({
          version: 1,
          recordId: record.id,
          contentType,
          dataBase64: file.toString('base64'),
        }),
      );
      const encrypted = encryptArchive(plain, keys.id, keys.keys.get(keys.id));
      const key = `staging/business/${record.id}/${randomUUID()}.bin`;
      const bucket = await admin.storage.getBucket(ARCHIVE_BUCKET);
      if (bucket.error || bucket.data?.public !== false) throw new Error('STORAGE');
      const upload = await admin.storage
        .from(ARCHIVE_BUCKET)
        .upload(key, encrypted, { upsert: false, contentType: 'application/octet-stream' });
      if (upload.error) throw new Error('STORAGE');
      const downloaded = await admin.storage.from(ARCHIVE_BUCKET).download(key);
      if (downloaded.error || !downloaded.data || downloaded.data.size > 2_000_000)
        throw new Error('STORAGE');
      const stored = Buffer.from(await downloaded.data.arrayBuffer());
      const decoded = decryptArchive(stored, keys.keys);
      if (decoded.payload.length !== plain.length || !timingSafeEqual(decoded.payload, plain))
        throw new Error('INTEGRITY');
      const attached = await admin.rpc('retention_export_work', {
        p_action: 'business_attach',
        p_data: { id: record.id, objectKey: key, keyId: decoded.keyId, sha256: digest(stored) },
      });
      if (attached.error || attached.data?.attached !== true) {
        // A lost response can follow a committed attachment. The orphan worker
        // checks references before removing an uncertain upload.
        if (!attached.error && attached.data?.attached === false) {
          await admin.storage.from(ARCHIVE_BUCKET).remove([key]);
        }
        throw new Error('STORAGE');
      }
      return json(200, { result: { saved: true } });
    }
    if (body.action === 'business_download') {
      const record = result.data;
      if (
        !record.object_key ||
        !/^staging\/business\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.bin$/.test(record.object_key)
      )
        return json(404, { error: 'No managed attachment is available.' });
      const payload = await readVerified(
        admin,
        record.object_key,
        record.ciphertext_sha256,
        record.key_id,
      );
      if (payload.recordId !== record.id) throw new Error('INTEGRITY');
      return json(200, { result: payload });
    }
    return json(200, { result: result.data });
  } catch {
    return json(503, {
      error:
        'Records could not be securely verified or saved. No completion is confirmed; refresh before retrying.',
    });
  }
}
async function readVerified(admin, key, hash, keyId) {
  const downloaded = await admin.storage.from(ARCHIVE_BUCKET).download(key);
  if (downloaded.error || !downloaded.data || downloaded.data.size > 2_000_000)
    throw new Error('STORAGE');
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  if (digest(bytes) !== hash) throw new Error('INTEGRITY');
  const decoded = decryptArchive(bytes, archiveKeys().keys);
  if (decoded.keyId !== keyId) throw new Error('INTEGRITY');
  return JSON.parse(decoded.payload.toString());
}
