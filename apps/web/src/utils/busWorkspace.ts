export type BusWorkspaceLifecycle = 'current' | 'upcoming' | 'history';

export function busWorkspaceLifecycle(
  item: {
    status: string;
    effective_from: string | null;
    effective_to: string | null;
  },
  currentDate = new Date().toISOString().slice(0, 10),
): BusWorkspaceLifecycle {
  if (item.status !== 'active' || (item.effective_to && item.effective_to < currentDate)) {
    return 'history';
  }
  if (item.effective_from && item.effective_from > currentDate) return 'upcoming';
  return 'current';
}

export function safeBusWorkspaceReturn(value: string | null, origin: string) {
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    if (
      url.origin !== origin ||
      !/^\/admin\/buses\/[^/]+$/.test(url.pathname) ||
      url.searchParams.get('tab') !== 'drivers'
    ) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
