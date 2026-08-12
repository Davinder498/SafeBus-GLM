import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const generatedPath = path.join(root, 'packages/types/src/database.generated.ts');
const generated = fs.readFileSync(generatedPath, 'utf8');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.') ? [absolute] : [];
  });
}

test('the committed generated contract covers the authoritative SafeBus schema', () => {
  assert.match(generated, /^export interface Database \{/m);
  assert.match(generated, /^\s{6}students: \{/m);
  assert.match(generated, /^\s{6}driver_trips: \{/m);
  assert.match(generated, /^\s{6}get_guardian_bus_visibility_v2: \{/m);
  assert.match(generated, /^\s{6}user_role:/m);
  assert.doesNotMatch(generated, /SUPABASE_(?:SECRET|ACCESS|DB)|postgres(?:ql)?:\/\//i);
});

test('every TypeScript Supabase client is parameterized by the generated Database contract', () => {
  const roots = ['apps', 'packages'];
  const offenders = [];

  for (const file of roots.flatMap((directory) => sourceFiles(path.join(root, directory)))) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes("from '@supabase/supabase-js'")) continue;

    if (/createClient\s*\(/.test(source)) offenders.push(path.relative(root, file));
    if (/\bSupabaseClient\s*(?:[|&;,)=]|$)/m.test(source)) offenders.push(path.relative(root, file));
  }

  assert.deepEqual([...new Set(offenders)], []);
});

test('every Netlify Supabase client declares the generated Database contract', () => {
  const directory = path.join(root, 'apps/web/netlify/functions');
  const offenders = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => path.join(directory, name))
    .filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      const clients = [...source.matchAll(/createClient\s*\(/g)].length;
      const contracts = [...source.matchAll(/SupabaseClient<import\('@safebus\/types\/database'\)\.Database>/g)].length;
      return clients !== contracts;
    })
    .map((file) => path.relative(root, file));

  assert.deepEqual(offenders, []);
});

test('the retired untyped trips helper cannot return', () => {
  assert.equal(fs.existsSync(path.join(root, 'packages/api/src/trips.ts')), false);
  const packageJson = fs.readFileSync(path.join(root, 'packages/api/package.json'), 'utf8');
  assert.doesNotMatch(packageJson, /"\.\/trips"/);
});
