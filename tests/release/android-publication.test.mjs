import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyAndroidPublicationFiles } from '../../scripts/check-android-publication-preflight.mjs';

test('Android publication files are complete, API 36 ready, and explicitly versioned', async () => {
  const result = await verifyAndroidPublicationFiles();

  assert.equal(result.applicationId, 'com.safebusalberta.app');
  assert.equal(result.brandName, 'BusSafe Alberta');
  assert.equal(result.targetSdk, 36);
  assert.equal(Object.keys(result.images).length, 7);
});
