/** Validate a return destination supplied by a route-workspace creation flow.
 * A link may name a bus service for preselecting a driver, but never authorizes
 * an assignment. The route and service are rechecked by the existing scoped reads.
 */
export function safeRouteWorkspaceReturn(value: string | null, origin: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    if (
      url.origin !== origin ||
      !/^\/admin\/routes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname) ||
      url.hash !== '#route-service'
    ) return null;
    const keys = Array.from(url.searchParams.keys());
    if (keys.some((key) => key !== 'service') || keys.length > 1) return null;
    const service = url.searchParams.get('service');
    if (service !== null && !/^[a-z0-9_-]{1,100}$/i.test(service)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
