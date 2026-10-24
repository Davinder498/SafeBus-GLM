// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('adds only the official invitation origin and preserves existing scopes on replay', async () => {
  // Local, in-memory PostgreSQL only. Extract the actual table constraints.
  const db = new PGlite();
  try {
    const foundation = await readFile(
      '../../supabase/migrations/0067_phase2_mfa_recent_auth_allowlist_ratelimit.sql',
      'utf8',
    );
    await db.exec('create table public.tenants(id uuid primary key);');
    await db.exec(
      foundation.slice(
        foundation.indexOf('create table if not exists public.allowed_redirect_origins'),
        foundation.indexOf('alter table public.allowed_redirect_origins enable row level security'),
      ),
    );
    await db.exec(`
      insert into public.tenants values ('10000000-0000-4000-8000-000000000001');
      insert into public.allowed_redirect_origins(tenant_id,origin) values
        (null,'https://bussafe.netlify.app'),
        ('10000000-0000-4000-8000-000000000001','https://school.example.test');
    `);
    const before = (await db.query('select * from public.allowed_redirect_origins order by origin'))
      .rows;
    const migration = await readFile(
      '../../supabase/migrations/pending/20261024014838_official_invitation_origin.sql',
      'utf8',
    );
    await db.exec(migration);
    await db.exec(migration);
    const after = (await db.query('select * from public.allowed_redirect_origins order by origin'))
      .rows;
    expect(after).toHaveLength(3);
    for (const entry of before) expect(after).toContainEqual(entry);
    expect(after.filter((r) => r.origin === 'https://safebus.kids')).toMatchObject([
      { tenant_id: null },
    ]);
    expect(after.some((r) => r.origin === 'https://www.safebus.kids')).toBe(false);
  } finally {
    await db.close();
  }
}, 30000);
