import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  archiveKeys,
  encryptArchive,
  decryptArchive,
  archiveOne,
} from '../../netlify/functions/retention-archive.mjs';
import {
  archiveRecoverySample,
  reportRetentionBacklog,
  validateLifecycleResult,
  RETENTION_CLASSES,
} from '../../netlify/functions/retention-lifecycle-scheduled.mjs';

describe('restricted GPS archive integrity', () => {
  const key = randomBytes(32);
  const config = { id: 'key1', keys: new Map([['key1', key]]) };
  it('emits only synthetic ciphertext during the bounded dry-run recovery window', () => {
    const now = Date.parse('2026-11-06T12:00:00Z');
    const env = {
      SAFEBUS_ARCHIVE_RECOVERY_CHECK_UNTIL: '2026-11-06T12:05:00Z',
      SAFEBUS_RETENTION_ARCHIVE_KEY_ID: config.id,
      SAFEBUS_RETENTION_ARCHIVE_KEYS: JSON.stringify({ key1: key.toString('base64') }),
    };
    expect(archiveRecoverySample(false, env, now)).toBeNull();
    expect(archiveRecoverySample(true, {}, now)).toBeNull();
    expect(archiveRecoverySample(true, env, now - 10 * 60_000)).toBeNull();
    expect(archiveRecoverySample(true, env, now + 5 * 60_000)).toBeNull();
    const { keyId, sample } = archiveRecoverySample(true, env, now);
    expect(keyId).toBe(config.id);
    const ciphertext = Buffer.from(sample, 'base64');
    expect(decryptArchive(ciphertext, config.keys).payload.toString()).toBe(
      'SafeBus archive recovery test',
    );
    expect(() => decryptArchive(ciphertext, new Map([[keyId, randomBytes(32)]]))).toThrow();
  });
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
  it('sends no backlog alerts during dry-runs or unsaturated execution', async () => {
    const notify = vi.fn();
    const log = vi.fn();
    expect(await reportRetentionBacklog({ dryRun: true, saturated: true, notify, log })).toEqual({ result: 'skipped' });
    expect(await reportRetentionBacklog({ dryRun: false, saturated: false, notify, log })).toEqual({ result: 'skipped' });
    expect(notify).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
  it('reports only bounded live backlog and contains provider failures', async () => {
    const lines = [];
    const log = (line) => lines.push(line);
    const notify = vi.fn().mockResolvedValue({ result: 'accepted' });
    expect(await reportRetentionBacklog({ dryRun: false, saturated: true, notify, log })).toEqual({ result: 'accepted' });
    expect(notify).toHaveBeenCalledWith({ checks: [{ check: 'retention_backlog', result: 'fail' }] });
    expect(JSON.parse(lines[0])).toEqual({ event: 'retention_lifecycle_backlog_alert', result: 'provider_accepted' });
    const failed = vi.fn(async () => { throw new Error('secret-provider-payload'); });
    expect(await reportRetentionBacklog({ dryRun: false, saturated: true, notify: failed, log })).toEqual({ result: 'failed' });
    expect(JSON.parse(lines[1])).toEqual({ event: 'retention_lifecycle_backlog_alert', result: 'failed', code: 'MONITOR_ALERT_DELIVERY_FAILED' });
    expect(lines.join(' ')).not.toContain('secret-provider-payload');
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
