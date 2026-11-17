import { createHmac } from 'node:crypto';
import { TARGET_REF } from './capacity-bootstrap.mjs';
export const RECOVERY_AUTH_URL = `https://${TARGET_REF}.supabase.co`;

export function assertRecoveryAuthKeys(secret, publishable) {
  if (!secret || !publishable || secret === publishable) throw Error('AUTH_KEYS_REQUIRED');
  for (const [key, role] of [
    [secret, 'service_role'],
    [publishable, 'anon'],
  ]) {
    if (key.startsWith('eyJ')) {
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (claims.ref !== TARGET_REF || claims.role !== role) throw Error('WRONG_AUTH_KEY');
    } else if (!key.startsWith(role === 'anon' ? 'sb_publishable_' : 'sb_secret_')) {
      throw Error('WRONG_AUTH_KEY');
    }
  }
}

// RFC 6238 SHA-1, six digits, 30-second interval. Only disposable test factors.
export function recoveryTotp(secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  if (!/^[A-Z2-7]+=*$/.test(secret)) throw Error('INVALID_TEST_FACTOR');
  const bits = [...secret.replace(/=+$/, '')]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
