import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const sharedEtaMigration =
  'supabase/migrations/pending/20261118143224_bound_shared_eta_query_expansion.sql';
export function expectedSharedEtaCatalog(before) {
  const expected = structuredClone(before);
  const rows = expected.catalog.routines.filter(
    (r) => r.schema_name === 'safebus_private' && r.proname === 'shared_live_bus_progress',
  );
  assert.equal(rows.length, 1, 'SHARED_ETA_ROUTINE_COUNT');
  const row = rows[0];
  if (createHash('md5').update(row.definition).digest('hex') !== '2c553bc8ccd824de92a91000e60153d6')
    throw Error('SHARED_ETA_BASELINE_MISMATCH');
  row.definition = row.definition
    .replace('), stop_states as (', '), stop_states as materialized (')
    .replace('), stop_eta as (', '), stop_eta as materialized (');
  return expected;
}
