import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareReturn,
  confirmReturnDelivery,
  digest,
} from '../../scripts/lib/assisted-return.mjs';
const tenant = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const now = '2026-01-01T00:00:00.000Z';
const request = () => ({
  version: 1,
  tenantId: tenant,
  requestReference: 'CASE-1',
  authorizationReference: 'AUTH-1',
  recipientVerificationReference: 'RECIPIENT-1',
  holdReviewReference: 'HOLD-1',
  operatorReference: 'OP-1',
  scope: 'One requested trip',
  deliveryMethod: 'Authority-approved encrypted transfer',
  completionDueAt: '2026-02-01T00:00:00Z',
  records: [{ policy: 'trip_records', recordId: id }],
  exclusions: [{ category: 'Other records', reason: 'Outside requested scope' }],
  retainedExceptions: [
    {
      category: 'Source records and backups',
      purpose: 'Export does not authorize deletion',
      reviewOrExpiryTrigger: 'Separate authorized disposal review',
      reviewerReference: 'OP-1',
    },
  ],
});
const row = () => ({ id, tenant_id: tenant, trip_name_snapshot: 'Route école', ended_at: now });
const receipt = (manifest) => ({
  manifestSha256: digest(JSON.stringify(manifest, null, 2) + '\n'),
  recipientVerificationReference: 'RECIPIENT-1',
  transferEvidenceReference: 'TRANSFER-1',
  recipientAcknowledgementReference: 'ACK-1',
  operatorReference: 'OP-1',
  deliveredAt: '2026-01-02T00:00:00Z',
});
test('scoped export preserves exact UTF-8, manifests every requested record and never claims deletion or delivery', async () => {
  const result = await prepareReturn(request(), async () => row(), now);
  assert.equal(JSON.parse(result.files[0].content).trip_name_snapshot, 'Route école');
  assert.equal(result.manifest.files[0].sha256, digest(result.files[0].content));
  assert.equal(result.manifest.status, 'prepared_not_delivered');
  assert.equal(result.manifest.deletion.performed, false);
  assert.equal(result.manifest.retainedExceptions.length, 1);
});
test('wrong authority, wrong record and secret-bearing exports are rejected', async () => {
  for (const value of [
    { ...row(), tenant_id: id },
    { ...row(), id: tenant },
    { ...row(), token_hash: 'secret' },
    { ...row(), nested: { tenant_id: id } },
    { ...row(), nested: { password: 'secret' } },
  ])
    await assert.rejects(
      prepareReturn(request(), async () => value, now),
      /RETURN_/,
    );
});
test('incomplete exports fail rather than returning a partial package', async () => {
  const r = request();
  r.records.push({ policy: 'trip_records', recordId: tenant });
  let calls = 0;
  await assert.rejects(
    prepareReturn(
      r,
      async () => {
        if (++calls === 2) throw new Error('unavailable');
        return row();
      },
      now,
    ),
    /unavailable/,
  );
});
test('scope, authority review, recipient, holds and exceptions must be explicit', async () => {
  for (const field of [
    'authorizationReference',
    'recipientVerificationReference',
    'holdReviewReference',
    'operatorReference',
    'scope',
    'completionDueAt',
  ]) {
    const r = request();
    delete r[field];
    await assert.rejects(
      prepareReturn(r, async () => row(), now),
      /RETURN_/,
    );
  }
  for (const change of [
    { records: [] },
    { records: [...request().records, ...request().records] },
    { exclusions: [] },
    { retainedExceptions: [] },
    { records: [{ policy: 'accounts', recordId: id }] },
  ])
    await assert.rejects(
      prepareReturn({ ...request(), ...change }, async () => row(), now),
      /RETURN_/,
    );
});
test('delivery requires exact manifest, unchanged files, matching recipient and acknowledgement', async () => {
  const result = await prepareReturn(request(), async () => row(), now);
  const proof = receipt(result.manifest);
  assert.equal(
    confirmReturnDelivery(result.manifest, result.files, proof).status,
    'delivery_recorded',
  );
  for (const change of [
    { manifestSha256: 'wrong' },
    { recipientVerificationReference: 'OTHER' },
    { recipientAcknowledgementReference: '' },
    { deliveredAt: '2025-01-01' },
  ])
    assert.throws(
      () => confirmReturnDelivery(result.manifest, result.files, { ...proof, ...change }),
      /RETURN_/,
    );
  assert.throws(() => confirmReturnDelivery(result.manifest, [], proof), /RETURN_/);
  assert.throws(
    () =>
      confirmReturnDelivery(result.manifest, [{ ...result.files[0], content: 'tampered' }], proof),
    /RETURN_/,
  );
  const completed = confirmReturnDelivery(result.manifest, result.files, {
    ...proof,
    status: 'destroyed',
    deletion: { performed: true },
  });
  assert.equal(completed.status, 'delivery_recorded');
  assert.equal(completed.deletion.performed, false);
});

test('CLI prepares an inspectable private package and confirms only exact delivered bytes', async () => {
  const { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'safebus-return-test-'));
  try {
    const req = join(dir, 'request.json'),
      preload = join(dir, 'mock.mjs'),
      out = join(dir, 'package');
    writeFileSync(req, JSON.stringify(request()));
    writeFileSync(
      preload,
      `globalThis.fetch=async(url,options)=>{if(url!=='https://safebus.kids/.netlify/functions/disposal-records'||options.redirect!=='error'||JSON.parse(options.body).action!=='export')throw new Error('invalid endpoint');return {ok:true,json:async()=>({result:${JSON.stringify(row())}})}};`,
    );
    const cli = resolve('scripts/assisted-return.mjs');
    const output = execFileSync(process.execPath, ['--import', preload, cli, 'prepare', req, out], {
      env: { ...process.env, SAFEBUS_RETURN_ACCESS_TOKEN: 'synthetic-test-only' },
      encoding: 'utf8',
    });
    assert.equal(JSON.parse(output).result, 'prepared_not_delivered');
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    assert.equal(statSync(join(out, 'manifest.json')).mode & 0o777, 0o600);
    const proof = receipt(manifest);
    proof.deliveredAt = new Date().toISOString();
    const receiptPath = join(dir, 'receipt.json');
    writeFileSync(receiptPath, JSON.stringify(proof));
    const confirmation = execFileSync(process.execPath, [cli, 'confirm', out, receiptPath], {
      encoding: 'utf8',
    });
    assert.equal(JSON.parse(confirmation).deletionPerformed, false);
    assert.equal(
      JSON.parse(readFileSync(join(out, 'delivery-record.json'), 'utf8')).status,
      'delivery_recorded',
    );
    assert.throws(() =>
      execFileSync(process.execPath, [cli, 'confirm', out, receiptPath], { stdio: 'pipe' }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
