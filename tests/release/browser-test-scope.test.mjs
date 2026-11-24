import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { browserTestScope, isTestRegistrationOnly } from '../../scripts/lib/browser-test-scope.mjs';

test('main and missing change evidence always require the full browser suite', () => {
  for (const event of ['push', 'workflow_dispatch', 'schedule', undefined])
    assert.equal(browserTestScope(event, ['README.md']).full, true);
  for (const paths of [undefined, [], null])
    assert.equal(browserTestScope('pull_request', paths).full, true);
});

test('only narrowly reviewed non-runtime PR paths omit browser execution', () => {
  const safe = ['README.md', 'docs/operations/readiness.md',
    'tests/release/authorization-surface.test.mjs',
    'config/observed/private-agreement-isolation-20261111.json',
    'config/authorization-surface.json', 'scripts/lib/private-retention-policy-audit.mjs'];
  assert.equal(browserTestScope('pull_request', safe).full, false);
  for (const sensitive of ['apps/web/src/routes/router.tsx', 'apps/mobile/src/main.tsx',
    'packages/types/src/database.generated.ts', 'supabase/migrations/new.sql',
    'scripts/release-engineering-artifact.mjs', 'scripts/lib/environment-identity.mjs',
    'tests/smoke/login.spec.ts', 'tests/release/release-smoke.spec.ts',
    'tests/release/helpers/fixtures.mjs', 'playwright.config.ts', 'pnpm-lock.yaml',
    'package.json', '.github/workflows/ci.yml', 'scripts/select-browser-tests.mjs',
    'scripts/lib/browser-test-scope.mjs', 'config/pending/security.json', 'new-file',
    'docs/../apps/web/main.ts', undefined])
    assert.equal(browserTestScope('pull_request', [...safe, sensitive]).full, true, String(sensitive));
  // Moving runtime code to a safe path retains the removed runtime path too.
  assert.equal(browserTestScope('pull_request', ['apps/web/old.ts', 'docs/new.md']).full, true);
});

test('CLI compares complete git history and falls back to full when evidence is invalid', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-scope-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  fs.writeFileSync(path.join(dir, 'README.md'), 'before'); git('add', '.'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'README.md'), 'after'); git('add', '.'); git('commit', '-qm', 'docs');
  const head = git('rev-parse', 'HEAD');
  const event = path.join(dir, 'event.json'), output = path.join(dir, 'output'), summary = path.join(dir, 'summary');
  const run = (value) => {
    fs.writeFileSync(event, JSON.stringify(value)); fs.writeFileSync(output, '');
    execFileSync(process.execPath, [path.resolve('scripts/select-browser-tests.mjs')], {
      cwd: dir, env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    });
    return fs.readFileSync(output, 'utf8');
  };
  assert.equal(run({ pull_request: { base: { sha: base }, head: { sha: head } } }), 'full=false\nandroid=false\n');
  assert.equal(run({ pull_request: { base: { sha: 'a'.repeat(40) }, head: { sha: head } } }), 'full=true\nandroid=true\n');
  assert.equal(run({}), 'full=true\nandroid=true\n');
});

test('isolated GPS candidate changes do not rebuild either unchanged client',()=>{
  const paths=['services/tracking-ingestion/direct-batch.mjs','services/tracking-ingestion/direct-batch.sql',
    'tests/release/direct-gps-batch.test.mjs'];
  assert.equal(browserTestScope('pull_request',paths).full,false);
  assert.equal(browserTestScope('pull_request',paths).android,false);
  for(const p of ['services/tracking-ingestion/server.mjs','supabase/functions/gps/index.ts',
    'supabase/migrations/pending/new.sql','apps/mobile/android/build.gradle','packages/types/src/index.ts',
    'netlify.toml','docs/../apps/mobile/main.ts']){
    const result=browserTestScope('pull_request',[...paths,p]);
    assert.equal(result.full,true,p);assert.equal(result.android,true,p);
  }
  assert.equal(browserTestScope('push',paths).android,true);
});
test('only additive, literal test registration may omit client suites for package.json',()=>{
  const prefix='turbo run test && node --test --test-concurrency=2 ';
  const before={scripts:{test:prefix+'tests/release/original.test.mjs',build:'turbo build'},dependencies:{a:'1'}};
  const after=structuredClone(before);
  after.scripts.test+=' tests/release/direct-gps-batch.test.mjs';
  const paths=['package.json','tests/release/direct-gps-batch.test.mjs'];
  assert.equal(isTestRegistrationOnly(before,after,paths),true);
  assert.equal(browserTestScope('pull_request',paths,{testRegistrationOnly:true}).full,false);
  assert.equal(browserTestScope('pull_request',paths).full,true);
  for(const changed of [
    {...after,dependencies:{a:'2'}},
    {...after,scripts:{...after.scripts,build:'echo no'}},
    {...after,scripts:{...after.scripts,test:prefix+'tests/release/direct-gps-batch.test.mjs'}},
    {...after,scripts:{...after.scripts,test:after.scripts.test+' && echo unsafe'}},
    {...after,scripts:{...after.scripts,test:after.scripts.test+' tests/release/unreviewed.test.mjs'}},
  ]) assert.equal(isTestRegistrationOnly(before,changed,paths),false);
  assert.equal(isTestRegistrationOnly(before,after,['package.json']),false);
});
