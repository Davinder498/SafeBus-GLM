import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, readConfiguration, isIsolated } from './production-credential-isolation.mjs';

const fail = (code) => {
  throw new Error('ENGINEERING_RELEASE_' + code);
};
export const REQUIRED_CHECKS = [
  'Typecheck, lint, and build',
  'Unit tests',
  'Browser smoke tests',
  'Android build and lint',
  'Migration verification',
  'Dependency audit',
  'Secret scanning',
  'CodeQL JavaScript and TypeScript',
  'CodeQL',
];
export function verifyChecks(runs, sha) {
  for (const name of REQUIRED_CHECKS) {
    const matching = runs
      .filter((r) => r.name === name && r.head_sha === sha)
      .sort((a, b) => b.id - a.id);
    if (matching[0]?.status !== 'completed' || matching[0]?.conclusion !== 'success')
      fail('CI_NOT_SUCCESSFUL');
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
export async function verifyHostedArtifact(deployId, policy, manifest, request = fetch) {
  if (!/^[a-f0-9]{24}$/.test(deployId)) fail('DEPLOY_ID');
  const entries = Object.entries(manifest).filter(([name]) => !name.startsWith('_'));
  let index = 0;
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, async () => {
      while (index < entries.length) {
        const [name, expected] = entries[index++];
        const url =
          `https://${deployId}--${policy.siteName}.netlify.app/` +
          name.split('/').map(encodeURIComponent).join('/');
        let verified = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await request(url, {
              redirect: 'error',
              signal: AbortSignal.timeout(10000),
            });
            if (response.ok && digest(Buffer.from(await response.arrayBuffer())) === expected) {
              verified = true;
              break;
            }
          } catch {
            /* Retry bounded CDN propagation; never print URLs or response bodies. */
          }
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!verified) fail('HOSTED_ARTIFACT_MISMATCH');
      }
    }),
  );
  if (results.some((r) => r.status === 'rejected')) fail('HOSTED_ARTIFACT_MISMATCH');
  return { publicFilesVerified: entries.length };
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
    const files = await verifyHosted(candidate, manifest);
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
