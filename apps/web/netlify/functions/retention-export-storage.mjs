import { createHash, timingSafeEqual } from 'node:crypto';
import { ARCHIVE_BUCKET, encryptArchive, decryptArchive } from './retention-archive.mjs';

const validKey = (key) =>
  typeof key === 'string' && /^exports\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.bin$/.test(key);
export async function exportOne(client, keys, { allowRemoval = true } = {}) {
  const storage = client.storage.from(ARCHIVE_BUCKET);
  const cleanup = allowRemoval
    ? await client.rpc('retention_export_work', { p_action: 'cleanup', p_data: {} })
    : { data: null, error: null };
  if (cleanup.error) throw new Error('RETENTION_EXPORT_RPC');
  if (cleanup.data) {
    const item = cleanup.data;
    if (!validKey(item.objectKey)) throw new Error('RETENTION_EXPORT_RESULT');
    const removed = await storage.remove([item.objectKey]);
    if (removed.error) throw new Error('RETENTION_EXPORT_REMOVE');
    const result = await client.rpc('retention_export_work', {
      p_action: 'removed',
      p_data: { id: item.id },
    });
    if (result.error || result.data?.removed !== true) throw new Error('RETENTION_EXPORT_RPC');
    return 'removed';
  }
  const next = await client.rpc('retention_export_work', { p_action: 'next', p_data: {} });
  if (next.error) throw new Error('RETENTION_EXPORT_RPC');
  if (next.data === null) return 'idle';
  if (next.data.finished === true) return 'finished';
  const item = next.data;
  if (
    !validKey(item.objectKey) ||
    item.payload?.chunkId !== item.id ||
    !Array.isArray(item.payload.rows) ||
    item.payload.rows.length < 1 ||
    item.payload.rows.length > 200
  )
    throw new Error('RETENTION_EXPORT_RESULT');
  const plain = Buffer.from(JSON.stringify(item.payload));
  const encrypted = encryptArchive(plain, keys.id, keys.keys.get(keys.id));
  if (encrypted.length > 2_000_000) throw new Error('RETENTION_EXPORT_SIZE');
  await storage
    .upload(item.objectKey, encrypted, { upsert: false, contentType: 'application/octet-stream' })
    .catch(() => null);
  const read = await storage.download(item.objectKey);
  if (read.error || !read.data || read.data.size > 2_000_000)
    throw new Error('RETENTION_EXPORT_DOWNLOAD');
  const stored = Buffer.from(await read.data.arrayBuffer());
  const decoded = decryptArchive(stored, keys.keys);
  if (decoded.payload.length !== plain.length || !timingSafeEqual(decoded.payload, plain))
    throw new Error('RETENTION_EXPORT_INTEGRITY');
  const verified = await client.rpc('retention_export_work', {
    p_action: 'verify',
    p_data: {
      id: item.id,
      keyId: decoded.keyId,
      sha256: createHash('sha256').update(stored).digest('hex'),
    },
  });
  if (verified.error || typeof verified.data?.verified !== 'boolean')
    throw new Error('RETENTION_EXPORT_RPC');
  return verified.data.verified ? 'verified' : 'changed';
}
export async function disposeBusinessOne(client) {
  const result = await client.rpc('retention_export_work', {
    p_action: 'business_due',
    p_data: {},
  });
  if (result.error) throw new Error('RETENTION_BUSINESS_RPC');
  const item = result.data;
  if (item === null) return 'idle';
  if (item.providerPending === true) return 'provider_pending';
  if (item.awaitingUpload === true) return 'awaiting_upload';
  if (item.objectKey !== null && item.objectKey !== undefined) {
    if (!/^staging\/business\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.bin$/.test(item.objectKey))
      throw new Error('RETENTION_BUSINESS_RESULT');
    const removed = await client.storage.from(ARCHIVE_BUCKET).remove([item.objectKey]);
    if (removed.error) throw new Error('RETENTION_BUSINESS_REMOVE');
  } else if (item.metadataOnly !== true) throw new Error('RETENTION_BUSINESS_RESULT');
  const completed = await client.rpc('retention_export_work', {
    p_action: 'business_removed',
    p_data: { id: item.id },
  });
  if (completed.error || completed.data?.removed !== true)
    throw new Error('RETENTION_BUSINESS_RPC');
  return 'removed';
}
