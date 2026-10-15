import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { generateFromOpenApi } from '../../scripts/lib/openapi-database-types.mjs';

const root = process.cwd();
const generatedPath = path.join(root, 'packages/types/src/database.generated.ts');
const generated = fs.readFileSync(generatedPath, 'utf8');

test('OpenAPI RPC nullability preserves required arguments and unknown results', () => {
  const source = generateFromOpenApi({
    definitions: {},
    paths: {
      '/rpc/update_platform_support_contact': {
        post: {
          parameters: [
            {
              in: 'body',
              schema: {
                properties: {
                  p_display_name: { type: 'string' },
                  p_email: { type: 'string' },
                  p_phone: { type: 'string' },
                  p_website_url: { type: 'string' },
                  p_support_hours: { type: 'string' },
                  p_instructions: { type: 'string' },
                },
                required: [
                  'p_display_name',
                  'p_email',
                  'p_phone',
                  'p_website_url',
                  'p_support_hours',
                  'p_instructions',
                ],
              },
            },
          ],
        },
      },
    },
  });
  const contact = source.slice(source.indexOf('update_platform_support_contact:'));
  assert.match(contact, /p_phone: string \| null/);
  assert.doesNotMatch(contact, /p_phone\?:/);
  assert.match(contact, /Returns: unknown/);
});

test('OpenAPI default arguments can be omitted without making required nullable arguments optional', () => {
  const source = generateFromOpenApi({
    definitions: {},
    paths: {
      '/rpc/metadata_probe': {
        post: {
          parameters: [
            {
              in: 'body',
              schema: {
                properties: {
                  p_required: { type: 'string', description: 'nullable' },
                  p_default: { type: 'integer', default: 10 },
                },
                required: ['p_required'],
              },
            },
          ],
        },
      },
    },
  });
  const probe = source.slice(
    source.indexOf('metadata_probe:'),
    source.indexOf('record_student_record_access:'),
  );
  assert.match(probe, /p_required: string \| null/);
  assert.match(probe, /p_default\?: number \| null/);
});

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
    if (/\bSupabaseClient\s*(?:[|&;,)=]|$)/m.test(source))
      offenders.push(path.relative(root, file));
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
      const contracts = [
        ...source.matchAll(/SupabaseClient<import\('@safebus\/types\/database'\)\.Database>/g),
      ].length;
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
