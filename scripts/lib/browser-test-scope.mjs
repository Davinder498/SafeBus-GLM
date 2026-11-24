import { isDeepStrictEqual } from 'node:util';

// Keep this exact allowlist deliberately small. These candidate tracking files
// are not imported by either client, not hosted, and not auto-migrated.
// Once a file becomes part of the shipped runtime, remove it from this list.
const isolatedTrackingCandidates = new Set([
  'services/tracking-ingestion/core.mjs',
  'services/tracking-ingestion/pgmq.mjs',
  'services/tracking-ingestion/direct-batch.mjs',
  'services/tracking-ingestion/direct-batch.sql',
]);
const releaseTest = /^tests\/release\/[a-z0-9][a-z0-9-]*\.test\.mjs$/;
const cleanPath = p => typeof p === 'string' && p.length > 0 &&
  !p.includes('\\') && !p.split('/').some(part => part === '.' || part === '..' || part === '');

function reviewedNonClientPath(path) {
  return cleanPath(path) && (
    /^(?:README|CHANGELOG)\.md$/.test(path) ||
    /^docs\/.*\.md$/.test(path) ||
    releaseTest.test(path) ||
    /^config\/observed\/[^/]+\.json$/.test(path) ||
    path === 'config/authorization-surface.json' ||
    path === 'scripts/lib/private-retention-policy-audit.mjs' ||
    isolatedTrackingCandidates.has(path)
  );
}

/**
 * Do not treat package.json as safe by filename. Only additions of specific
 * release test file arguments to the existing test command qualify. Preserve
 * the original command, existing tests, dependencies, scripts and metadata.
 * Every added argument must refer to a changed release test in the same diff.
 */
export function isTestRegistrationOnly(before, after, paths) {
  if (!before || !after || !Array.isArray(paths)) return false;
  const old = structuredClone(before), next = structuredClone(after);
  const a = old.scripts?.test, b = next.scripts?.test;
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  delete old.scripts.test;
  delete next.scripts.test;
  if (!isDeepStrictEqual(old, next)) return false;
  const prefix = 'turbo run test && node --test --test-concurrency=2 ';
  if (!a.startsWith(prefix) || !b.startsWith(prefix)) return false;
  const original = a.slice(prefix.length).split(' ');
  const updated = b.slice(prefix.length).split(' ');
  const testPath = /^tests\/(?:release|phase5)\/[a-z0-9][a-z0-9-]*\.test\.mjs$/;
  if (![...original,...updated].every(p => testPath.test(p)) ||
      new Set(updated).size !== updated.length || updated.length <= original.length) return false;
  const previous = new Set(original);
  if (!isDeepStrictEqual(updated.filter(p => previous.has(p)), original)) return false;
  return updated.filter(p => !previous.has(p)).every(p => releaseTest.test(p) && paths.includes(p));
}

// Fail closed. Main and release validation keep complete coverage.
// All quality, unit, migration, dependency, secret and static security jobs
// remain mandatory even when client-only suites are unnecessary.
export function browserTestScope(eventName, paths, {testRegistrationOnly = false} = {}) {
  if (eventName !== 'pull_request' || !Array.isArray(paths) || paths.length === 0)
    return { full: true, android: true, reason: 'Main, unknown event, or unavailable change evidence' };
  if (paths.every(path => reviewedNonClientPath(path) || (path === 'package.json' && testRegistrationOnly === true)))
    return { full: false, android: false, reason: 'Only reviewed non-client paths or verified release-test registration changed' };
  return { full: true, android: true, reason: 'Application, security contracts, workflows, dependencies or unclassified changes' };
}
