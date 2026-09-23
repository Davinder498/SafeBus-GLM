import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = 'supabase/migrations/0108_guardian_eta_service_line.sql';

test('guardian ETA service line keeps its guardian-only RPC boundary', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  assert.match(sql, /get_guardian_bus_service_lines\(p_bus_number text\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /auth\.uid\(\) is null/);
  assert.match(sql, /current_user_role\(\).*guardian/s);
  assert.match(sql, /current_guardian_id\(\)/);
  assert.match(sql, /current_tenant_id\(\)/);
  assert.match(
    sql,
    /revoke all on function public\.get_guardian_bus_service_lines\(text\) from public, anon/,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_guardian_bus_service_lines\(text\) to authenticated/,
  );
});

test('guardian ETA model covers shape, fallback, direction, freshness, and pause safeguards', async () => {
  const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();

  for (const expected of [
    'route_shape_id',
    'st_linelocatepoint',
    'shape_tolerance_m',
    'fallback_tolerance_m',
    "'route_shape'",
    "'stop_sequence'",
    "interval '2 minutes'",
    'loc.recorded_at > now()',
    "v_service.direction = 'reverse'",
    "v_service.trip_status = 'paused'",
    'v_service.speed_mps * 0.6',
    'scheduled_seconds',
    '> 5400',
  ]) {
    assert.ok(sql.includes(expected), `missing ETA safeguard: ${expected}`);
  }

  assert.match(sql, /where not exists \(select 1 from shape_context\)/);
  assert.match(sql, /where fp\.off_route_m <= fp\.fallback_tolerance_m/);
  assert.match(sql, /where sp\.off_route_m <= sp\.shape_tolerance_m/);
});

test('guardian ETA response remains additive and telemetry-safe', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  for (const field of [
    'progressPercent',
    'progressSource',
    'nextStopName',
    'nextStopOrder',
    'etaUpdatedAt',
    'serviceState',
    'etaStatus',
    'etaMinMinutes',
    'etaMaxMinutes',
    'etaLabel',
  ]) {
    assert.ok(sql.includes(`'${field}'`), `missing response field: ${field}`);
  }

  for (const privateField of ['accuracyM', 'speedMps', 'driverId', 'tripId', 'tenantId']) {
    assert.ok(!sql.includes(`'${privateField}'`), `private JSON field exposed: ${privateField}`);
  }
});

test('guardian UI uses authoritative progress and honours reduced motion', async () => {
  const [page, css] = await Promise.all([
    readFile('apps/web/src/pages/GuardianBusDetailPage.tsx', 'utf8'),
    readFile('apps/web/src/index.css', 'utf8'),
  ]);

  assert.match(page, /line\.progressPercent/);
  assert.doesNotMatch(page, /calculateGuardianBusProgress/);
  assert.match(page, /progressSource === 'stop_sequence'/);
  assert.match(page, /Planned \{plannedTime/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /guardian-service-line__travelled/);
});
