import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertRecoveryAuthKeys,
  recoveryTotp,
  RECOVERY_AUTH_URL,
} from '../../scripts/lib/recovery-auth.mjs';
const jwt = (ref, role) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.test`;
test('Auth keys fail closed for a foreign project, reversed roles and missing configuration', () => {
  const ref = new URL(RECOVERY_AUTH_URL).hostname.split('.')[0];
  const secret = jwt(ref, 'service_role');
  const pub = jwt(ref, 'anon');
  assert.doesNotThrow(() => assertRecoveryAuthKeys(secret, pub));
  assert.doesNotThrow(() => assertRecoveryAuthKeys('sb_secret_fixture', 'sb_publishable_fixture'));
  assert.throws(() => assertRecoveryAuthKeys(jwt('ckrkfylsyihwouvesypm', 'service_role'), pub));
  assert.throws(() => assertRecoveryAuthKeys(secret, jwt('ckrkfylsyihwouvesypm', 'anon')));
  assert.throws(() => assertRecoveryAuthKeys(pub, secret));
  assert.throws(() => assertRecoveryAuthKeys(secret, secret));
  assert.throws(() => assertRecoveryAuthKeys('', pub));
  assert.throws(() => assertRecoveryAuthKeys('arbitrary', pub));
});
test('disposable-factor TOTP agrees with independent RFC 6238 SHA-1 vectors', () => {
  // Public RFC vector: the ASCII bytes 12345678901234567890, encoded as Base32.
  const rfcVector = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  for (const [seconds, expected] of [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ]) {
    assert.equal(recoveryTotp(rfcVector, seconds * 1000), expected);
  }
  assert.throws(() => recoveryTotp('invalid!'));
});
