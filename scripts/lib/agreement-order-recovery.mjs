export function agreementOrderRecoverySql(functions) {
  const original = functions
    .filter((f) => f.definition)
    .map((f) => f.definition.trim().replace(/;$/, '') + ';');
  const added = [...functions]
    .reverse()
    .filter((f) => !f.definition)
    .map((f) => 'DROP FUNCTION ' + f.signature + ';');
  return (
    `DO $$ BEGIN IF EXISTS(SELECT 1 FROM safebus_private.agreement_packages) OR EXISTS(SELECT 1 FROM safebus_private.agreement_catalog) OR EXISTS(SELECT 1 FROM safebus_private.agreement_executed_artifacts) THEN RAISE EXCEPTION 'Published or accepted agreements prevent rollback'; END IF; END $$;\n` +
    [
      ...original,
      ...added,
      'ALTER TABLE safebus_private.agreement_packages DROP CONSTRAINT agreement_packages_tenant_id_revision_order_revision_key;',
      'ALTER TABLE safebus_private.agreement_packages ADD CONSTRAINT agreement_packages_tenant_id_revision_key UNIQUE(tenant_id,revision);',
      'ALTER TABLE safebus_private.agreement_packages DROP COLUMN order_revision, DROP COLUMN order_details;',
    ].join('\n')
  );
}
