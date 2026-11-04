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
  const serviceExecutable = new Set([...publicFunctions].filter((name) => !deniedService.has(name)));
  return { authenticated, serviceOnly, publicFunctions, serviceExecutable };
}
