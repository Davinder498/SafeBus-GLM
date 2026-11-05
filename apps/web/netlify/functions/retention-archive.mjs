import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const ARCHIVE_BUCKET = 'retention-evidence';
const digest = (value) => createHash('sha256').update(value).digest('hex');

export function archiveKeys(env = process.env) {
  const id = env.SAFEBUS_RETENTION_ARCHIVE_KEY_ID;
  let configured;
  try {
    configured = JSON.parse(env.SAFEBUS_RETENTION_ARCHIVE_KEYS || '{}');
  } catch {
    throw new Error('RETENTION_ARCHIVE_CONFIG');
  }
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id || '') || !configured || Array.isArray(configured))
    throw new Error('RETENTION_ARCHIVE_CONFIG');
  const keys = new Map();
  for (const [name, value] of Object.entries(configured)) {
    if (
      !/^[A-Za-z0-9_-]{1,40}$/.test(name) ||
      typeof value !== 'string' ||
      !/^[A-Za-z0-9+/]{43}=$/.test(value)
    )
      throw new Error('RETENTION_ARCHIVE_CONFIG');
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32) throw new Error('RETENTION_ARCHIVE_CONFIG');
    keys.set(name, key);
  }
  if (!keys.has(id)) throw new Error('RETENTION_ARCHIVE_CONFIG');
  return { id, keys };
}

export function encryptArchive(payload, id, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const header = Buffer.from(
    JSON.stringify({ version: 1, keyId: id, nonce: nonce.toString('base64') }),
  );
  cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([length, header, cipher.getAuthTag(), ciphertext]);
}

export function decryptArchive(bytes, keys) {
  if (bytes.length < 36) throw new Error('RETENTION_ARCHIVE_INTEGRITY');
  const length = bytes.readUInt32BE(0);
  if (length < 1 || length > 512 || bytes.length < length + 20)
    throw new Error('RETENTION_ARCHIVE_INTEGRITY');
  const header = bytes.subarray(4, 4 + length);
  const metadata = JSON.parse(header.toString());
  const key = keys.get(metadata.keyId);
  if (metadata.version !== 1 || !key) throw new Error('RETENTION_ARCHIVE_CONFIG');
  const nonce = Buffer.from(metadata.nonce || '', 'base64');
  if (nonce.length !== 12) throw new Error('RETENTION_ARCHIVE_INTEGRITY');
  const cipher = createDecipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(header);
  cipher.setAuthTag(bytes.subarray(4 + length, 20 + length));
  return {
    payload: Buffer.concat([cipher.update(bytes.subarray(20 + length)), cipher.final()]),
    keyId: metadata.keyId,
  };
}

// One chunk per invocation. Upload retries never overwrite an existing evidence object.
// The source stays protected until read-back, authenticated decryption and byte comparison pass.
export async function archiveOne(client, configuration) {
  const bucket = await client.storage.getBucket(ARCHIVE_BUCKET);
  if (bucket.error || !bucket.data || bucket.data.public !== false)
    throw new Error('RETENTION_ARCHIVE_CONFIG');
  const cleanup = await client.rpc('retention_archive_work', { p_action: 'cleanup', p_data: {} });
  if (cleanup.error) throw new Error('RETENTION_ARCHIVE_RPC');
  if (cleanup.data) {
    const item = cleanup.data;
    if (!validItem(item)) throw new Error('RETENTION_ARCHIVE_RESULT');
    const removed = await client.storage.from(ARCHIVE_BUCKET).remove([item.objectKey]);
    if (removed.error) throw new Error('RETENTION_ARCHIVE_REMOVE');
    const confirmed = await client.rpc('retention_archive_work', {
      p_action: 'removed',
      p_data: { id: item.id },
    });
    if (confirmed.error || confirmed.data?.removed !== true)
      throw new Error('RETENTION_ARCHIVE_RPC');
    return 'removed';
  }
  const next = await client.rpc('retention_archive_work', { p_action: 'next', p_data: {} });
  if (next.error) throw new Error('RETENTION_ARCHIVE_RPC');
  if (next.data === null) return 'idle';
  const item = next.data;
  if (
    !validItem(item) ||
    !item.payload ||
    item.payload.chunkId !== item.id ||
    !Array.isArray(item.payload.samples) ||
    item.payload.samples.length < 1 ||
    item.payload.samples.length > 500
  )
    throw new Error('RETENTION_ARCHIVE_RESULT');
  const payload = Buffer.from(JSON.stringify(item.payload));
  const bytes = encryptArchive(payload, configuration.id, configuration.keys.get(configuration.id));
  const storage = client.storage.from(ARCHIVE_BUCKET);
  // Upload results can be ambiguous after a timeout or duplicate retry. A
  // successful authenticated read-back of this exact snapshot is the evidence.
  await storage
    .upload(item.objectKey, bytes, { contentType: 'application/octet-stream', upsert: false })
    .catch(() => null);
  const downloaded = await storage.download(item.objectKey);
  if (downloaded.error || !downloaded.data || downloaded.data.size > 2_000_000)
    throw new Error('RETENTION_ARCHIVE_DOWNLOAD');
  const stored = Buffer.from(await downloaded.data.arrayBuffer());
  const decrypted = decryptArchive(stored, configuration.keys);
  if (decrypted.payload.length !== payload.length || !timingSafeEqual(decrypted.payload, payload))
    throw new Error('RETENTION_ARCHIVE_INTEGRITY');
  const verified = await client.rpc('retention_archive_work', {
    p_action: 'verify',
    p_data: { id: item.id, sha256: digest(stored), keyId: decrypted.keyId },
  });
  // A concurrent release/verification leaves originals protected or an already
  // verified chunk. Its released object is picked up by the cleanup branch.
  if (verified.error || typeof verified.data?.verified !== 'boolean')
    throw new Error('RETENTION_ARCHIVE_RPC');
  return verified.data.verified ? 'verified' : 'changed';
}

function validItem(item) {
  return (
    typeof item?.id === 'string' &&
    /^[0-9a-f-]{36}$/.test(item.id) &&
    typeof item.objectKey === 'string' &&
    /^[0-9a-f-]{36}\.bin$/.test(item.objectKey)
  );
}
