// Only these reviewed tracking/retention/disposal/agreement tables are intentionally
// private, RLS-enabled, and without policies. They are not client-facing RLS
// tables; adding a permissive or empty policy merely to appease an audit is
// not a security improvement. Every other missing session guard must fail.
export const REVIEWED_PRIVATE_RETENTION_TABLES = Object.freeze([
  'safebus_private.agreement_catalog',
  'safebus_private.agreement_document_versions',
  'safebus_private.agreement_executed_artifacts',
  'safebus_private.agreement_packages',
  'safebus_private.disposal_accounts',
  'safebus_private.disposal_extensions',
  'safebus_private.disposal_holds',
  'safebus_private.disposal_runs',
  'safebus_private.driver_tracking_state',
  'safebus_private.participant_agreement_acceptances',
  'safebus_private.participant_agreement_requirements',
  'safebus_private.participant_terms_publication',
  'safebus_private.retention_cases',
  'safebus_private.retention_lifecycle_totals',
  'safebus_private.tenant_agreement_requirement',
]);

export function assertMissingSessionPolicies(rows) {
  const reviewed = new Set(REVIEWED_PRIVATE_RETENTION_TABLES);
  for (const row of rows) {
    if (
      !reviewed.has(row.object_name) ||
      row.schema_name !== 'safebus_private' ||
      row.owner_name !== 'postgres' ||
      row.rls_enabled !== true ||
      Number(row.policy_count) !== 0 ||
      row.anon_has_privileges !== false ||
      row.authenticated_has_privileges !== false ||
      row.service_has_privileges !== false
    ) {
      throw new Error(
        'Restrictive session policies are missing or reviewed private table isolation changed: ' +
          row.object_name,
      );
    }
  }
  return { reviewedPrivateNoPolicyTables: rows.length };
}
