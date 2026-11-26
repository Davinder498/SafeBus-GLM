import {
  assertEnvironmentIdentity,
  createEnvironmentBinding,
} from './lib/environment-identity.mjs';
import { verifiedDatabaseClient } from './lib/security-workflow-evidence.mjs';

const databaseUrl = process.env.SAFEBUS_DATABASE_URL;
const guardianId = process.env.SYNTHETIC_GUARDIAN_ID;

async function main() {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(guardianId ?? ''))
    throw new Error('Guardian scope is missing');
  const binding = createEnvironmentBinding({
    environment: 'production',
    databaseUrl,
    supabaseUrl: 'https://ckrkfylsyihwouvesypm.supabase.co',
  });
  const client = verifiedDatabaseClient(
    databaseUrl,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'bussafe-capacity-preflight',
  );
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '3s'");
    await client.query("SET LOCAL lock_timeout = '1s'");
    await assertEnvironmentIdentity(client, binding);
    const {
      rows: [scope],
    } = await client.query(
      `
      select count(distinct s.id)::int as linked_students,
             count(distinct b.bus_id)::int as assigned_buses
      from public.guardians g
      join public.student_guardians sg on sg.guardian_id=g.id and sg.tenant_id=g.tenant_id
      join public.students s on s.id=sg.student_id and s.tenant_id=g.tenant_id
      left join public.student_bus_assignments a on a.student_id=s.id and a.tenant_id=g.tenant_id
        and a.status='active' and current_date between a.effective_from and coalesce(a.effective_to,'infinity'::date)
      left join public.bus_route_assignments b on b.id=a.bus_route_assignment_id and b.tenant_id=g.tenant_id
        and b.status='active' and current_date between coalesce(b.effective_from,'-infinity'::date) and coalesce(b.effective_to,'infinity'::date)
      where g.id=$1 and g.status='active' and s.status='active' and sg.status='active'
        and (sg.access_expires_at is null or sg.access_expires_at>now())
    `,
      [guardianId],
    );
    console.log(JSON.stringify(scope));
    if (scope.linked_students < 1 || scope.assigned_buses !== 1) process.exitCode = 1;
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  }
}

main().catch(() => {
  console.error(
    'BusSafe preflight stopped. Verify the target, registered identity, guardian scope and database connection.',
  );
  process.exitCode = 1;
});
