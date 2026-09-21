import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('existing routes can reorder and add stops without becoming creates', () => {
  const migration = read('supabase/migrations/0101_defer_route_stop_order_uniqueness.sql');
  const page = read('apps/web/src/pages/AdminRoutesPage.tsx');
  const service = read('apps/web/src/services/transportationStructureService.ts');

  assert.match(migration, /unique\s*\(route_id,\s*stop_order\)\s*deferrable initially deferred/i);
  assert.match(page, /route:\s*\{\s*\.\.\.payload\.route,\s*id:\s*editingRoute\.id\s*\}/i);
  assert.match(service, /route_stops_route_order_unique/i);
  assert.doesNotMatch(
    service,
    /duplicate key value violates unique constraint[\s\S]{0,120}message\.includes\('route'\)/i,
  );
});
