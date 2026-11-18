import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const visibilityContextMigration =
  'supabase/migrations/pending/20261118120604_guardian_visibility_request_context.sql';
export function expectedVisibilityDefinition(definition) {
  if (createHash('md5').update(definition).digest('hex') !== 'aae58b9d0f86b17189f5cdfd9361bbd5')
    throw Error('VISIBILITY_BASELINE_MISMATCH');
  for (const helper of [
    'safebus_private.current_tenant_id()',
    'safebus_private.current_guardian_id()',
    'safebus_private.current_user_role()',
    'auth.uid()',
  ])
    definition = definition.replaceAll(helper, `(select ${helper})`);
  return definition;
}
export function expectedVisibilityCatalog(before) {
  const expected = structuredClone(before);
  const rows = expected.catalog.routines.filter(
    (r) =>
      r.schema_name === 'public' &&
      r.proname === 'get_guardian_bus_visibility_v2' &&
      r.arguments === '',
  );
  assert.equal(rows.length, 1, 'VISIBILITY_ROUTINE_COUNT');
  rows[0].definition = expectedVisibilityDefinition(rows[0].definition);
  return expected;
}
