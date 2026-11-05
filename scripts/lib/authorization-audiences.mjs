// The historical manifest lists authenticated and service-only APIs separately.
// Explicit denials preserve newer authenticated-only contracts without granting
// service-role execution just to satisfy an audit.
export function authorizationAudiences(surface) {
  const authenticated = new Set(surface.authenticated);
  const serviceOnly = new Set(surface.serviceRole);
  const deniedService = new Set(surface.serviceRoleDenied ?? []);
  for (const signature of deniedService) {
    if (!authenticated.has(signature) || serviceOnly.has(signature))
      throw new Error('Service-role denial must name an authenticated-only RPC.');
  }
  const publicFunctions = new Set([...authenticated, ...serviceOnly]);
  const serviceExecutable = new Set(
    [...publicFunctions].filter((name) => !deniedService.has(name)),
  );
  return { authenticated, serviceOnly, publicFunctions, serviceExecutable };
}

// BusSafe's secret-key discovery document advertises the complete reviewed
// surface. Execution grants remain a separate, signature-level catalog check.
export function assertAdvertisedRpcSurface(openApi, reviewedPublicFunctions) {
  if (!openApi?.paths || typeof openApi.paths !== 'object' || Array.isArray(openApi.paths))
    throw new Error('Data API discovery returned invalid OpenAPI paths.');
  const advertised = new Set(
    Object.keys(openApi.paths)
      .filter((entry) => entry.startsWith('/rpc/'))
      .map((entry) => entry.slice(5)),
  );
  const expected = new Set(
    [...reviewedPublicFunctions].map((signature) => signature.slice(0, signature.indexOf('('))),
  );
  const unexpected = [...advertised].filter((name) => !expected.has(name)).sort();
  const missing = [...expected].filter((name) => !advertised.has(name)).sort();
  if (unexpected.length || missing.length)
    throw new Error(
      'Advertised Data API RPC names differs from the approved inventory. ' +
        `Unexpected: ${unexpected.join(', ') || 'none'}. Missing: ${missing.join(', ') || 'none'}.`,
    );
  return { advertisedRpcNames: advertised.size };
}
