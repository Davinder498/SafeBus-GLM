import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const migration = await fs.readFile('supabase/migrations/0121_admin_trip_search.sql', 'utf8');

test('recorded trip search keeps caller RLS and explicit tenant/school authorization', () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.doesNotMatch(
    migration,
    /security definer|disable row level security|create policy|grant select/i,
  );
  assert.match(migration, /auth\.uid\(\) is null or v_tenant_id is null or v_role is null/i);
  assert.match(
    migration,
    /v_role not in \('tenant_admin', 'school_admin', 'transportation_admin'\)/i,
  );
  assert.match(migration, /dt\.tenant_id = v_tenant_id/);
  assert.match(
    migration,
    /v_role <> 'school_admin' or r\.school_id = public\.current_school_id\(\)/,
  );
  for (const alias of ['r', 'rtp', 'b', 'd', 'p'])
    assert.match(migration, new RegExp(`${alias}\\.tenant_id = dt\\.tenant_id`));
  assert.match(migration, /from public, anon, authenticated, service_role/i);
  assert.match(
    migration,
    /grant execute on function public\.search_admin_trips\(date, date, text, integer, integer\) to authenticated/i,
  );
});

test('date/status predicates precede bounded pagination with an independent total count', () => {
  const filter = migration.indexOf('with filtered');
  const pagination = migration.indexOf('page_rows as');
  assert.ok(filter >= 0 && pagination > filter);
  const filtered = migration.slice(filter, pagination);
  assert.match(filtered, /dt\.service_date >= p_from_date/);
  assert.match(filtered, /dt\.service_date <= p_to_date/);
  assert.match(filtered, /dt\.status = p_status/);
  assert.doesNotMatch(filtered, /\blimit\b/i);
  assert.match(migration, /order by service_date desc, started_at desc, trip_id/);
  assert.match(migration, /limit p_page_size offset \(\(p_page::bigint - 1\) \* p_page_size\)/);
  assert.match(migration, /'totalCount', \(select count\(\*\) from filtered\)/);
  assert.match(migration, /p_page_size not in \(25, 50, 100\)/);
  assert.match(migration, /p_from_date > p_to_date/);
  assert.doesNotMatch(
    migration,
    /create or replace function public\.get_admin_trip_overview|\b(?:insert into|update public|delete from)\b/i,
  );
});

test('trip search exposes operational labels without student or guardian records', () => {
  assert.doesNotMatch(
    migration,
    /from public\.(?:students|guardians)|join public\.(?:students|guardians)/i,
  );
  assert.match(migration, /dt\.status in \('active', 'paused', 'completed', 'cancelled'\)/);
  assert.match(migration, /coalesce\(dt\.trip_name_snapshot, rtp\.display_name\)/);
  assert.match(migration, /b\.bus_number as bus_label, p\.full_name as driver_label/);
});
