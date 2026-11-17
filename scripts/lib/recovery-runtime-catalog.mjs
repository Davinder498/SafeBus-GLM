// pg_policies.roles is name[] (OID 1003), which node-postgres returns as text.
// Use text[] so the release driver and local PostgreSQL tests both return arrays.
export const recoveryPolicyQuery =
  "select policyname,permissive,roles::text[] as roles,cmd,qual,with_check from pg_policies where schemaname='realtime' and tablename='messages' order by policyname";
