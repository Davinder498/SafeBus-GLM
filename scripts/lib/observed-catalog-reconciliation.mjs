import { sha256 } from './migrations.mjs';

const partitionAcl = [
  'supabase_realtime_admin=arwdDxtm/supabase_realtime_admin',
  'postgres=a*r*wdDxtm/supabase_realtime_admin',
  'dashboard_user=arwdDxtm/supabase_realtime_admin',
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function validateCatalogReconciliation(contract) {
  const previous = contract.sourceSecurityInstallation.installedCatalogSha256;
  const reconciliation = contract.sourceCatalogReconciliation;
  if (contract.sourceCatalogSha256 === previous && reconciliation === undefined) return;
  if (
    reconciliation?.format !== 1 ||
    reconciliation.kind !== 'reviewed-realtime-partition-additions' ||
    reconciliation.previousCatalogSha256 !== previous ||
    reconciliation.observedCatalogSha256 !== contract.sourceCatalogSha256 ||
    !Array.isArray(reconciliation.addedRelations) ||
    !reconciliation.addedRelations.length ||
    new Set(reconciliation.addedRelations.map((r) => r.name)).size !==
      reconciliation.addedRelations.length ||
    reconciliation.addedRelations.some(
      (r) =>
        r.schema !== 'realtime' ||
        !/^messages_\d{4}_\d{2}_\d{2}$/.test(r.name ?? '') ||
        r.rls !== false ||
        r.force_rls !== false ||
        !same(r.acl, partitionAcl),
    )
  )
    throw new Error('A reviewed exact catalog reconciliation is required.');
}

export function assertObservedCatalog(snapshot, contract) {
  validateCatalogReconciliation(contract);
  if (
    snapshot.publicFingerprint !== contract.schemaFingerprint ||
    sha256(JSON.stringify(snapshot)) !== contract.sourceCatalogSha256
  )
    throw new Error('Observed schema or authorization changed; review a forward reconciliation.');
  const reconciliation = contract.sourceCatalogReconciliation;
  if (!reconciliation) return;
  const previous = structuredClone(snapshot);
  for (const addition of reconciliation.addedRelations) {
    const matches = previous.authorization.relations.filter((r) => same(r, addition));
    if (matches.length !== 1) throw new Error('Catalog additions differ from reviewed evidence.');
    previous.authorization.relations = previous.authorization.relations.filter(
      (r) => !same(r, addition),
    );
  }
  if (sha256(JSON.stringify(previous)) !== reconciliation.previousCatalogSha256)
    throw new Error('Catalog reconciliation does not reproduce original installation evidence.');
}

export async function inspectReconciledPartitions(client, contract) {
  const additions = contract.sourceCatalogReconciliation?.addedRelations;
  if (!additions) return;
  const { rows } = await client.query(
    `select c.relname,c.relkind,c.relispartition,
    pg_get_userbyid(c.relowner) as owner,c.relrowsecurity,c.relforcerowsecurity,
    pg_get_expr(c.relpartbound,c.oid) as bound,
    (select array_agg(pn.nspname||'.'||p.relname order by i.inhseqno) from pg_inherits i
      join pg_class p on p.oid=i.inhparent join pg_namespace pn on pn.oid=p.relnamespace
      where i.inhrelid=c.oid) as parents,
    (select count(*)::integer from pg_policy where polrelid=c.oid) as policies,
    (select count(*)::integer from pg_attribute where attrelid=c.oid and attnum>0
      and not attisdropped and attacl is not null) as column_acl_count,
    (select count(*)::integer from pg_trigger where tgrelid=c.oid and not tgisinternal) as user_triggers
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='realtime' and c.relname::text=any($1::text[]) order by c.relname`,
    [additions.map((r) => r.name)],
  );
  if (rows.length !== additions.length)
    throw new Error('Reviewed Realtime partitions are missing.');
  for (const row of rows) {
    const date = row.relname.slice('messages_'.length).replaceAll('_', '-');
    const start = new Date(date + 'T00:00:00.000Z');
    if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date)
      throw new Error('Reviewed Realtime partition date is invalid.');
    const end = new Date(start.getTime() + 86400000).toISOString().slice(0, 10);
    if (
      row.relkind !== 'r' ||
      row.relispartition !== true ||
      row.owner !== 'supabase_realtime_admin' ||
      row.relrowsecurity !== false ||
      row.relforcerowsecurity !== false ||
      !same(row.parents, ['realtime.messages']) ||
      row.bound !== `FOR VALUES FROM ('${date} 00:00:00') TO ('${end} 00:00:00')` ||
      row.policies !== 0 ||
      row.column_acl_count !== 0 ||
      row.user_triggers !== 0
    )
      throw new Error('Reviewed Realtime partition structure or authorization differs.');
  }
}
