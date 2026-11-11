// Default to full coverage. Only reviewed non-runtime paths can opt out on PRs.
export function browserTestScope(eventName, paths) {
  if (eventName !== 'pull_request' || !Array.isArray(paths) || paths.length === 0)
    return { full: true, reason: 'Main, unknown event, or unavailable change evidence' };
  const safe = (path) =>
    /^(?:README|CHANGELOG)\.md$/.test(path) ||
    /^docs\/.*\.md$/.test(path) ||
    /^tests\/release\/[^/]+\.test\.mjs$/.test(path) ||
    /^config\/observed\/[^/]+\.json$/.test(path) ||
    path === 'config/authorization-surface.json' ||
    path === 'scripts/lib/private-retention-policy-audit.mjs';
  if (paths.every((path) => typeof path === 'string' && safe(path)))
    return { full: false, reason: 'Only reviewed documentation, catalog evidence, audit inventory or release unit tests changed' };
  return { full: true, reason: 'Application, security contracts, workflows, dependencies or unclassified changes' };
}
