#!/usr/bin/env node
// Read-only, fail-closed attestation of the currently published SafeBus Netlify deploy.
// This does not check Resend delivery or approve a production release.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const GUARDIAN_EMAIL_FIX_SHA = 'e05c286446a56138814d9548cb262155d721f767';
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function assessPublishedDeploy(deploy, { isAncestor }) {
  const evidence = {
    status: 'not_verified',
    reason: '',
    deployId: typeof deploy?.id === 'string' ? deploy.id : null,
    publishedCommit: typeof deploy?.commit_ref === 'string' ? deploy.commit_ref : null,
    publishedAt: typeof deploy?.published_at === 'string' ? deploy.published_at : null,
    source: 'Netlify site.published_deploy',
  };
  if (!deploy) return { ...evidence, reason: 'published_deploy_missing' };
  if (deploy.state !== 'ready') return { ...evidence, reason: 'published_deploy_not_ready' };
  if (deploy.context && deploy.context !== 'production') {
    return { ...evidence, reason: 'unexpected_deploy_context' };
  }
  if (deploy.branch && deploy.branch !== 'main') {
    return { ...evidence, reason: 'unexpected_deploy_branch' };
  }
  // Do not infer deployed code from a manually supplied deploy title/message.
  if (!SHA_PATTERN.test(evidence.publishedCommit || '')) {
    return { ...evidence, reason: 'immutable_commit_ref_unavailable' };
  }
  if (!isAncestor(GUARDIAN_EMAIL_FIX_SHA, evidence.publishedCommit)) {
    return { ...evidence, reason: 'guardian_email_fix_not_in_deployed_commit' };
  }
  if (!isAncestor(evidence.publishedCommit, 'origin/main')) {
    return { ...evidence, reason: 'deployed_commit_not_in_main_history' };
  }
  return { ...evidence, status: 'published_source_includes_fix', reason: 'source_commit_attested' };
}

function gitAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      stdio: 'ignore',
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

function writeSummary(result) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const lines = [
    '## SafeBus guardian-email production source verification',
    '',
    `- Result: **${result.status}**`,
    `- Reason: \\`${result.reason}\\``,
    `- Published Netlify deploy ID: \\`${result.deployId || 'unavailable'}\\``,
    `- Published commit: \\`${result.publishedCommit || 'unavailable'}\\``,
    `- Required fix commit: \\`${GUARDIAN_EMAIL_FIX_SHA}\\``,
    '',
    'This verifies source ancestry only. It does **not** prove deployed function content, real Resend delivery, privacy approval, legal approval, or pilot authorization.',
    '',
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}

export async function main({ env = process.env, request = fetch, isAncestor = gitAncestor } = {}) {
  const token = env.NETLIFY_AUTH_TOKEN;
  const siteId = env.NETLIFY_SITE_ID;
  if (!token || !siteId) throw new Error('netlify_verification_credentials_missing');
  // Never embed user-supplied URLs, and never print tokens or API response bodies.
  const url = `https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}`;
  const response = await request(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`netlify_read_failed_http_${response.status}`);
  const site = await response.json();
  if (site.id && site.id !== siteId && site.name !== siteId) {
    throw new Error('netlify_site_identity_mismatch');
  }
  const assessment = assessPublishedDeploy(site.published_deploy, { isAncestor });
  if (env.GITHUB_STEP_SUMMARY) writeSummary(assessment);
  console.log(JSON.stringify(assessment));
  if (assessment.status !== 'published_source_includes_fix') {
    process.exitCode = 1;
  }
  return assessment;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.env.GITHUB_ACTIONS === 'true') {
      execFileSync('git', ['fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main'], {
        stdio: 'ignore',
        timeout: 25_000,
      });
    }
    await main();
  } catch (error) {
    console.error(JSON.stringify({ status: 'not_verified', reason: error.message }));
    process.exitCode = 1;
  }
}
