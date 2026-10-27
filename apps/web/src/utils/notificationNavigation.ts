export const pendingNotificationKey = 'safebus.pendingNotificationPath';

export function pendingNotificationPath(): string | null {
  const path = sessionStorage.getItem(pendingNotificationKey);
  if (!path) return null;
  if (
    /^\/notifications(?:\?notification=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i.test(
      path,
    )
  )
    return path;
  sessionStorage.removeItem(pendingNotificationKey);
  return null;
}
