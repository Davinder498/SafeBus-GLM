import { assertCapacityScope, capacityAccountCount } from './recovery-capacity-cleanup.mjs';
export function recoverCapacityScope({ run, buses, tenants, users }) {
  const scope = {
    run,
    buses,
    tenantIds: tenants.map((t) => t.id),
    emails: Array.from(
      { length: capacityAccountCount(buses) },
      (_, i) => `capacity-load-${run}-${i}@example.test`,
    ),
  };
  assertCapacityScope(scope);
  const expectedEmails = new Set(scope.emails);
  const validUserCount =
    buses === 5000
      ? users.length > 0 && users.length <= expectedEmails.size
      : users.length === expectedEmails.size;
  if (
    tenants.some((t, i) => t.type !== 'demo' || t.name !== `Capacity Load ${run} ${i + 1}`) ||
    !validUserCount ||
    users.some((u) => u.run !== run || !expectedEmails.has(u.email)) ||
    new Set(users.map((u) => u.email)).size !== users.length
  )
    throw Error('CAPACITY_CLEANUP_OWNERSHIP');
  return scope;
}
