import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  archiveKeys,
  encryptArchive,
  decryptArchive,
  archiveOne,
} from '../../netlify/functions/retention-archive.mjs';
import {
  validateLifecycleResult,
  RETENTION_CLASSES,
} from '../../netlify/functions/retention-lifecycle-scheduled.mjs';

describe('restricted GPS archive integrity', () => {
  const key = randomBytes(32);
  const config = { id: 'key1', keys: new Map([['key1', key]]) };
  it('encrypts with authenticated metadata, fresh nonces and versioned keys', () => {
    const value = Buffer.from('selected evidence');
    const first = encryptArchive(value, 'key1', key);
    const second = encryptArchive(value, 'key1', key);
    expect(first.equals(second)).toBe(false);
    expect(first.includes(value)).toBe(false);
    expect(decryptArchive(first, config.keys).payload.equals(value)).toBe(true);
    first[first.length - 1] ^= 1;
    expect(() => decryptArchive(first, config.keys)).toThrow();
    expect(() => decryptArchive(second, new Map())).toThrow('RETENTION_ARCHIVE_CONFIG');
  });
  it('requires a dedicated 256-bit key and preserves previous key versions', () => {
    expect(() => archiveKeys({})).toThrow('RETENTION_ARCHIVE_CONFIG');
    expect(() =>
      archiveKeys({
        SAFEBUS_RETENTION_ARCHIVE_KEY_ID: 'key1',
        SAFEBUS_RETENTION_ARCHIVE_KEYS: '{"key1":"bad"}',
      }),
    ).toThrow();
    expect(
      archiveKeys({
        SAFEBUS_RETENTION_ARCHIVE_KEY_ID: 'key1',
        SAFEBUS_RETENTION_ARCHIVE_KEYS: JSON.stringify({ key1: key.toString('base64') }),
      }).keys.get('key1'),
    ).toEqual(key);
  });
  function client({
    publicBucket = false,
    corrupt = false,
    downloadError = false,
    uploadError = null,
  } = {}) {
    const item = {
      id: '11111111-1111-4111-8111-111111111111',
      objectKey: '22222222-2222-4222-8222-222222222222.bin',
      payload: { chunkId: '11111111-1111-4111-8111-111111111111', samples: [{ id: 'selected' }] },
    };
    let stored;
    const storage = {
      upload: vi.fn(async (_path, bytes) => {
        stored = Buffer.from(bytes);
        return { error: uploadError };
      }),
      download: vi.fn(async () => {
        if (downloadError) return { data: null, error: { statusCode: '404' } };
        if (corrupt) stored[stored.length - 1] ^= 1;
        return { data: new Blob([stored]), error: null };
      }),
    };
    return {
      rpc: vi.fn(async (_name, args) => ({
        data:
          args.p_action === 'cleanup' ? null : args.p_action === 'next' ? item : { verified: true },
        error: null,
      })),
      storage: {
        getBucket: vi.fn(async () => ({ data: { public: publicBucket }, error: null })),
        from: () => storage,
      },
    };
  }
  it('marks coverage only after upload and authenticated read-back', async () => {
    const c = client();
    expect(await archiveOne(c, config)).toBe('verified');
    expect(c.rpc.mock.calls.at(-1)[1]).toMatchObject({
      p_action: 'verify',
      p_data: { keyId: 'key1' },
    });
    expect(c.rpc.mock.calls.at(-1)[1].p_data.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([{ publicBucket: true }, { corrupt: true }, { downloadError: true }])(
    'failure retains originals: %j',
    async (options) => {
      const c = client(options);
      await expect(archiveOne(c, config)).rejects.toThrow();
      expect(c.rpc.mock.calls.some(([, args]) => args.p_action === 'verify')).toBe(false);
    },
  );
  it('accepts an ambiguous upload only when stored ciphertext decrypts to the exact snapshot', async () => {
    const c = client({ uploadError: { statusCode: '500' } });
    expect(await archiveOne(c, config)).toBe('verified');
  });
  it('rejects incomplete, unknown and unbounded deletion reports', () => {
    const valid = {
      version: 1,
      dryRun: true,
      limit: 500,
      counts: Object.fromEntries(RETENTION_CLASSES.map((k) => [k, 0])),
    };
    expect(validateLifecycleResult(valid, true)).toEqual(valid.counts);
    for (const value of [
      { ...valid, dryRun: false },
      { ...valid, counts: {} },
      { ...valid, counts: { ...valid.counts, gps: 501 } },
      { ...valid, counts: { ...valid.counts, other: 0 } },
    ])
      expect(() => validateLifecycleResult(value, true)).toThrow();
  });
});
