import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('existing routes can reorder and add stops without becoming creates', () => {
  const migration = read('supabase/migrations/0101_defer_route_stop_order_uniqueness.sql');
  const page = read('apps/web/src/components/admin/RouteSetupPanel.tsx');
  const service = read('apps/web/src/services/transportationStructureService.ts');

  assert.match(migration, /unique\s*\(route_id,\s*stop_order\)\s*deferrable initially deferred/i);
  assert.match(page, /route:\s*\{\s*\.\.\.payload\.route,\s*id:\s*route\.id\s*\}/i);
  assert.match(service, /route_stops_route_order_unique/i);
  assert.doesNotMatch(
    service,
    /duplicate key value violates unique constraint[\s\S]{0,120}message\.includes\('route'\)/i,
  );
});

test('road-path writers cannot confuse output variables with row columns', () => {
  const migration = read('supabase/migrations/0117_fix_route_shape_rpc_column_ambiguity.sql');
  const functions = [...migration.matchAll(/as \$\$([\s\S]*?)\$\$;/gi)].map((match) => match[1]);
  assert.equal(functions.length, 2);
  for (const body of functions) {
    assert.match(body, /#variable_conflict error/);
    assert.match(body, /public\.require_route_shape_admin\(\)/);
    assert.match(body, /for update/i);
    for (const predicate of body.matchAll(/\bwhere\b([\s\S]*?);/gi)) {
      assert.doesNotMatch(
        predicate[1],
        /(?<![\w.])(?:id|route_id|version|status|distance_meters|geojson|effective_from|effective_to|created_at)\b/i,
      );
    }
    assert.doesNotMatch(body, /returning\s+\*|coalesce\(\s*effective_from\b/i);
    assert.match(body, /returning rs\.\* into v_shape/i);
  }
  assert.match(functions[0], /public\.validate_route_shape_geojson\(p_geojson\)/);
});

test('road-path fix preserves the public RPC signatures and access boundary', () => {
  const original = read('supabase/migrations/0057_versioned_route_geometry.sql');
  const migration = read('supabase/migrations/0117_fix_route_shape_rpc_column_ambiguity.sql');
  for (const name of ['admin_create_route_shape_version', 'admin_publish_route_shape_version']) {
    const signature = new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?as \\$\\$`,
      'i',
    );
    const canonical = (value) => value.match(signature)[0].replace(/\s+/g, ' ').trim();
    assert.equal(canonical(migration), canonical(original));
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}\\([^;]*from public, anon`, 'i'),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\([^;]*to authenticated`, 'i'),
    );
  }
  assert.doesNotMatch(
    migration,
    /create policy|disable row level security|#variable_conflict use_/i,
  );
});
