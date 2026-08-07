import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const read = (file) => fs.readFile(file, 'utf8');

test('production response headers include every Phase 4 control', async () => {
  const config = await read('netlify.toml');
  for (const header of [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ]) {
    assert.match(config, new RegExp(header));
  }
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /object-src 'none'/);
});

test('web and mobile release builds exclude public source maps', async () => {
  for (const configPath of ['apps/web/vite.config.ts', 'apps/mobile/vite.config.ts']) {
    assert.match(await read(configPath), /sourcemap:\s*false/);
  }
});

test('mobile WebView debugging and mixed content are disabled', async () => {
  const config = await read('apps/mobile/capacitor.config.ts');
  assert.match(config, /allowMixedContent:\s*false/);
  assert.match(config, /webContentsDebuggingEnabled:\s*false/);
});

test('fonts are self-hosted and Google font requests are absent', async () => {
  const files = await Promise.all([
    read('apps/web/index.html'),
    read('apps/mobile/index.html'),
    read('apps/web/src/index.css'),
  ]);
  const combined = files.join('\n');
  for (const forbiddenHost of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
    assert.equal(combined.includes(forbiddenHost), false);
  }
  assert.match(files[2], /@fontsource-variable\/inter/);
});

test('rollback requires protected environment confirmation and immutable ref', async () => {
  const workflow = await read('.github/workflows/rollback.yml');
  assert.match(workflow, /environment: \$\{\{ inputs\.environment \}\}/);
  assert.match(workflow, /ROLLBACK_/);
  assert.match(workflow, /git rev-parse/);
  assert.match(workflow, /netlify deploy --prod/);
});

test('CI declares every Phase 4 gate', async () => {
  const ci = await read('.github/workflows/ci.yml');
  for (const gate of [
    'Typecheck',
    'Lint',
    'Production build',
    'Unit tests',
    'RLS execution',
    'Browser smoke tests',
    'Dependency audit',
    'Secret scanning',
    'Migration verification',
  ]) {
    assert.match(ci, new RegExp(gate, 'i'));
  }
  assert.match(await read('.github/workflows/codeql.yml'), /CodeQL/);
});
