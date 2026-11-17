import fs from 'node:fs/promises';
import {
  geometryFixture,
  migrationPath as geometryMigration,
  id,
  readLine,
} from './shared-route-geometry-db.mjs';
export { id, readLine };
export const migrationPath =
  'supabase/migrations/pending/20261117064801_shared_live_bus_progress.sql';
export async function liveProgressFixture(t) {
  const db = await geometryFixture(t);
  await db.exec(await fs.readFile(geometryMigration, 'utf8'));
  const previous = (
    await db.query(
      "select pg_get_functiondef('public.get_guardian_bus_service_lines(text)'::regprocedure) as def",
    )
  ).rows[0].def;
  await db.exec(
    previous.replace(
      'public.get_guardian_bus_service_lines(',
      'public.previous_guardian_service_lines(',
    ),
  );
  return db;
}
