export type BusWorkspaceLifecycle = 'current' | 'upcoming' | 'history';
export type BusAssignmentEffectiveStatus =
  'active' | 'scheduled' | 'expired' | 'inactive' | 'archived';

type DatedAssignment = {
  status: string;
  effective_from: string | null;
  effective_to: string | null;
};

export function busWorkspaceLifecycle(
  item: DatedAssignment,
  currentDate = new Date().toISOString().slice(0, 10),
): BusWorkspaceLifecycle {
  if (item.status !== 'active' || (item.effective_to && item.effective_to < currentDate)) {
    return 'history';
  }
  if (item.effective_from && item.effective_from > currentDate) return 'upcoming';
  return 'current';
}

export function busAssignmentEffectiveStatus(
  item: DatedAssignment,
  currentDate = new Date().toISOString().slice(0, 10),
): BusAssignmentEffectiveStatus {
  if (item.status === 'archived') return 'archived';
  if (item.status !== 'active') return 'inactive';
  if (item.effective_to && item.effective_to < currentDate) return 'expired';
  if (item.effective_from && item.effective_from > currentDate) return 'scheduled';
  return 'active';
}

export function busAssignmentEndDate(
  item: Pick<DatedAssignment, 'effective_from' | 'effective_to'>,
  currentDate = new Date().toISOString().slice(0, 10),
) {
  const requestedEnd =
    item.effective_from && currentDate < item.effective_from ? item.effective_from : currentDate;
  return item.effective_to && item.effective_to < requestedEnd ? item.effective_to : requestedEnd;
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
