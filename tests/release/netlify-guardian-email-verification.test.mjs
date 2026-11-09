import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPublishedDeploy, GUARDIAN_EMAIL_FIX_SHA } from '../../scripts/verify-netlify-guardian-email-production.mjs';

const good = Object.freeze({
  id: 'safe-synthetic-id',
  state: 'ready',
  context: 'production',
  branch: 'main',
  commit_ref: GUARDIAN_EMAIL_FIX_SHA,
  published_at: '2026-11-09T00:43:00Z',
});

test('passes only when published source contains the merged guardian fix and is on main', () => {
  const calls = [];
  const evidence = assessPublishedDeploy(good, { isAncestor: (a, b) => {
    calls.push([a,b]); return true;
  }});
  assert.equal(evidence.status, 'published_source_includes_fix');
  assert.deepEqual(calls, [[GUARDIAN_EMAIL_FIX_SHA, GUARDIAN_EMAIL_FIX_SHA], [GUARDIAN_EMAIL_FIX_SHA, 'origin/main']]);
});

test('fails closed when no published deploy, wrong state, context or branch', () => {
  const ancestry = () => { throw new Error('unexpected'); };
  const cases = [
    [null, 'published_deploy_missing'],
    [{ ...good, state: 'building' }, 'published_deploy_not_ready'],
    [{ ...good, context: 'deploy-preview' }, 'unexpected_deploy_context'],
    [{ ...good, branch: 'staging' }, 'unexpected_deploy_branch'],
  ];
  for (const [deploy, reason] of cases) {
    assert.equal(assessPublishedDeploy(deploy, { isAncestor: ancestry }).reason, reason);
  }
});

test('does not treat a matching deploy message as proof when commit_ref is missing', () => {
  const result = assessPublishedDeploy({ ...good, commit_ref: null, title: GUARDIAN_EMAIL_FIX_SHA }, { isAncestor: () => true });
  assert.equal(result.reason, 'immutable_commit_ref_unavailable');
});

test('rejects an unpatched deploy or a deploy not reachable from main', () => {
  const olderSha = '1'.repeat(40);
  assert.equal(assessPublishedDeploy({ ...good, commit_ref: olderSha }, {
    isAncestor: () => false,
  }).reason, 'guardian_email_fix_not_in_deployed_commit');
  assert.equal(assessPublishedDeploy(good, {
    isAncestor: (_a, b) => b !== 'origin/main',
  }).reason, 'deployed_commit_not_in_main_history');
});
