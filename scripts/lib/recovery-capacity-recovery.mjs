import { assertCapacityScope } from './recovery-capacity-cleanup.mjs';
export function recoverCapacityScope({ run, buses, tenants, users }) {
  const scope = {
    run,
    buses,
    tenantIds: tenants.map((t) => t.id),
    emails: Array.from({ length: buses + 51 }, (_, i) => `capacity-load-${run}-${i}@example.test`),
  };
  assertCapacityScope(scope);
  if (
    tenants.some((t, i) => t.type !== 'demo' || t.name !== `Capacity Load ${run} ${i + 1}`) ||
    users.length !== scope.emails.length ||
    users.some((u) => u.run !== run || !scope.emails.includes(u.email)) ||
    new Set(users.map((u) => u.email)).size !== users.length
  )
    throw Error('CAPACITY_CLEANUP_OWNERSHIP');
  return scope;
}
