import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, readConfiguration, isIsolated } from './production-credential-isolation.mjs';

const fail = (code) => {
  throw new Error('ENGINEERING_RELEASE_' + code);
};
export function requirePrelaunchMaintenance(scope) {
  if (scope?.commercialLaunchApproved !== false) fail('PRELAUNCH_ONLY');
}
export const REQUIRED_CHECKS = [
  'Typecheck, lint, and build',
  'Unit tests',
  'Browser smoke tests',
  'Android build and lint',
  'Migration verification',
  'Dependency audit',
  'Secret scanning',
  'CodeQL JavaScript and TypeScript',
];
export function collectCheckRuns(readPage) {
  const runs = [];
  // Bound release evidence independently of accumulated workflow history.
  for (let page = 1; page <= 10; page++) {
    const response = readPage(page);
    if (!Array.isArray(response?.check_runs) || response.check_runs.length > 100)
      fail('CI_EVIDENCE_INVALID');
    runs.push(...response.check_runs);
    if (response.check_runs.length < 100) return runs;
  }
  fail('CI_EVIDENCE_PAGE_LIMIT');
}
export function verifyChecks(runs, sha) {
  const failures = [];
  function verify(name, source, required) {
    const matching = runs
      .filter((r) => r.name === name && r.head_sha === sha)
      .sort((a, b) => b.id - a.id);
    const latest = matching[0];
    if (!latest && !required) return;
    const reason = !latest
      ? 'missing'
      : latest.app?.id !== source.id || latest.app?.slug !== source.slug
        ? 'untrusted_source'
        : latest.status !== 'completed'
          ? 'incomplete'
          : latest.conclusion !== 'success'
            ? 'not_successful'
            : null;
    if (reason) failures.push({ name, reason });
  }
  for (const name of REQUIRED_CHECKS) {
    verify(name, { id: 15368, slug: 'github-actions' }, true);
  }
  // This Advanced Security summary is present on PRs, but was absent on the
  // observed main commit. The actual CodeQL analysis job above is mandatory.
  // If a summary exists for this SHA, it must also succeed; never ignore it.
  verify('CodeQL', { id: 57789, slug: 'github-advanced-security' }, false);
  if (failures.length) {
    const error = new Error('ENGINEERING_RELEASE_CI_NOT_SUCCESSFUL');
    error.checks = failures;
    throw error;
  }
}
export async function artifactManifest(directory, prefix = '') {
  const files = {};
  for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = (prefix ? prefix + '/' : '') + entry.name;
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) fail('ARTIFACT_LINK');
    if (entry.isDirectory()) Object.assign(files, await artifactManifest(directory, name));
    else {
      if (name.endsWith('.map')) fail('SOURCE_MAP');
      if ((await fs.stat(path.join(directory, name))).size > 20 * 1024 * 1024)
        fail('ARTIFACT_BOUND');
      files[name] = digest(await fs.readFile(path.join(directory, name)));
    }
  }
  if (Object.keys(files).length > 500) fail('ARTIFACT_BOUND');
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}
export async function verifyHostedArtifact(
  deployId,
  policy,
  manifest,
  request = fetch,
  { pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now } = {},
) {
  if (!/^[a-f0-9]{24}$/.test(deployId)) fail('DEPLOY_ID');
  const entries = Object.entries(manifest).filter(([name]) => !name.startsWith('_'));
  const deadline = now() + 120000;
  const retryDelays = [2000, 5000, 10000, 15000, 20000];
  const failures = [];
  let index = 0;
  let verifiedCount = 0;
  let retries = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (index < entries.length && failures.length === 0) {
        const [name, expected] = entries[index++];
        const url =
          `https://${deployId}--${policy.siteName}.netlify.app/` +
          name.split('/').map(encodeURIComponent).join('/');
        let verified = false;
        let failure;
        let attempts = 0;
        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
          const remaining = deadline - now();
          if (remaining <= 0) {
            failure = { reason: 'verification_deadline' };
            break;
          }
          attempts++;
          let retryable = true;
          try {
            const response = await request(url, {
              // Inspect the status without following a redirect off this deploy.
              redirect: 'manual',
              signal: AbortSignal.timeout(Math.min(10000, remaining)),
            });
            if (response.ok) {
              if (digest(Buffer.from(await response.arrayBuffer())) === expected) {
                verified = true;
                verifiedCount++;
                break;
              }
              failure = { reason: 'digest_mismatch', status: response.status };
              // Preserve a short recheck for bytes, but allow more time for
              // temporary CDN/network failures. Neither can pass without a match.
              retryable = attempt < 2;
            } else {
              const status = response.status;
              failure = {
                reason: status >= 300 && status < 400 ? 'redirect' : 'http_error',
                status,
              };
              retryable = [404, 408, 425, 429].includes(status) || status >= 500;
              await response.body?.cancel();
            }
          } catch (error) {
            failure = {
              reason: ['TimeoutError', 'AbortError'].includes(error?.name)
                ? 'timeout'
                : 'network_error',
            };
            // Never retain arbitrary messages, response bodies or redirect URLs.
            const code = error?.cause?.code ?? error?.code;
            if (
              [
                'ENOTFOUND',
                'EAI_AGAIN',
                'ECONNRESET',
                'ECONNREFUSED',
                'ETIMEDOUT',
                'UND_ERR_CONNECT_TIMEOUT',
                'UND_ERR_SOCKET',
              ].includes(code)
            )
              failure.networkCode = code;
          }
          if (!retryable || attempt === retryDelays.length) break;
          const delay = Math.min(retryDelays[attempt], Math.max(0, deadline - now()));
          if (delay > 0) await pause(delay);
          retries++;
        }
        if (!verified) {
          failures.push({
            path: name.replace(/[^a-zA-Z0-9_./-]/g, '?').slice(0, 240),
            attempts,
            ...failure,
          });
        }
      }
    }),
  );
  if (failures.length) {
    const mismatch = failures.some((failure) => failure.reason === 'digest_mismatch');
    const error = new Error(
      'ENGINEERING_RELEASE_HOSTED_ARTIFACT_' + (mismatch ? 'MISMATCH' : 'UNAVAILABLE'),
    );
    error.hostedArtifact = {
      publicFilesExpected: entries.length,
      publicFilesVerified: verifiedCount,
      retries,
      failures: failures.sort((a, b) => a.path.localeCompare(b.path)),
    };
    throw error;
  }
  return { publicFilesVerified: verifiedCount, hostedRetries: retries };
}
export async function deliveryState(api, policy) {
  const state = await readConfiguration(api, policy);
  if (
    state.site.build_settings.stop_builds !== true ||
    state.credentials.some((v) => !isIsolated(v))
  )
    fail('DELIVERY_CONTROLS_NOT_ACTIVE');
  if (state.site.published_deploy.locked === true) fail('OPERATOR_PUBLISH_FREEZE');
  return state;
}
export async function publishEngineeringArtifact({
  api,
  policy,
  sha,
  manifest,
  upload,
  localManifest,
  verifyHosted,
  health,
  record,
}) {
  const before = await deliveryState(api, policy);
  const previous = before.site.published_deploy.id;
  await record('previous', {
    sourceSha: sha,
    previousDeployId: previous,
    previousSourceSha: before.site.published_deploy.commit_ref ?? null,
    manifest,
    commercialLaunchApproved: false,
    databaseWritesPerformed: false,
  });
  let candidate;
  try {
    const result = await upload();
    candidate = result.deploy_id;
    if (
      result.site_id !== policy.siteId ||
      !/^[a-f0-9]{24}$/.test(candidate ?? '') ||
      candidate === previous
    )
      fail('UPLOAD_RESPONSE');
    await record('uploaded', { sourceSha: sha, deployId: candidate });
    const live = await deliveryState(api, policy),
      deploy = await api('/deploys/' + candidate);
    if (
      live.site.published_deploy.id !== candidate ||
      deploy.site_id !== policy.siteId ||
      deploy.context !== 'production' ||
      deploy.state !== 'ready'
    )
      fail('PUBLISHED_DEPLOY');
    if (JSON.stringify(await localManifest()) !== JSON.stringify(manifest))
      fail('LOCAL_ARTIFACT_CHANGED');
    let files;
    try {
      files = await verifyHosted(candidate, manifest);
    } catch (error) {
      if (error?.hostedArtifact) {
        // An evidence-write failure must never prevent restoration of production.
        try {
          await record('hosted-verification-failed', {
            deployId: candidate,
            ...error.hostedArtifact,
          });
        } catch {
          error.evidenceWriteFailed = true;
        }
      }
      throw error;
    }
    await health();
    await record('verified', {
      sourceSha: sha,
      deployId: candidate,
      previousDeployId: previous,
      ...files,
      sourceBinding:
        'Protected exact-main workflow upload, immutable artifact manifest and hosted file byte comparison; not inferred from deploy title.',
      cloudBuildsStopped: true,
      productionContextCredentials: true,
      commercialLaunchApproved: false,
      sourceEventDeliveryVerified: false,
      databaseWritesPerformed: false,
    });
    return { deployId: candidate };
  } catch (error) {
    // A lost upload response has an unknown outcome; do not overwrite a concurrent
    // operator action or invent a deployment identity from its display title.
    if (candidate && /^[a-f0-9]{24}$/.test(candidate)) {
      const live = await api('/sites/' + policy.siteId);
      if (live.published_deploy?.id === candidate && live.published_deploy.locked !== true) {
        await api(`/sites/${policy.siteId}/deploys/${previous}/restore`, { method: 'POST' });
        const restored = await api('/sites/' + policy.siteId);
        if (restored.published_deploy?.id !== previous) fail('ROLLBACK_NOT_VERIFIED');
        await record('rollback', {
          failedDeployId: candidate,
          restoredDeployId: previous,
          verified: true,
        });
      }
    }
    throw error;
  }
}
