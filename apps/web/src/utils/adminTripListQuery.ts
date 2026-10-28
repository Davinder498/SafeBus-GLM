import type { AdminTripDateMode, AdminTripSearchQuery } from '@/types/adminTripSearch';
import { adminTripDateBounds, albertaToday } from './adminTripDates';

export function readTripListQuery(params: URLSearchParams): {
  mode: AdminTripDateMode;
  query: AdminTripSearchQuery;
} {
  const rawMode = params.get('tripMode');
  const mode: AdminTripDateMode = ['today', 'date', 'range'].includes(rawMode ?? '')
    ? (rawMode as AdminTripDateMode)
    : 'all';
  const today = albertaToday();
  let dates: { fromDate: string | null; toDate: string | null };
  try {
    dates = adminTripDateBounds({
      mode,
      date: params.get('tripFrom') ?? today,
      fromDate: params.get('tripFrom') ?? today,
      toDate: params.get('tripTo') ?? today,
    });
  } catch {
    return readTripListQuery(new URLSearchParams());
  }
  const rawStatus = params.get('tripStatus');
  const page = Number(params.get('tripPage') ?? 1);
  const pageSize = Number(params.get('tripSize') ?? 25);
  return {
    mode,
    query: {
      ...dates,
      status: ['active', 'paused', 'completed', 'cancelled', 'ongoing'].includes(rawStatus ?? '')
        ? (rawStatus as AdminTripSearchQuery['status'])
        : null,
      page: Number.isSafeInteger(page) && page > 0 && page <= 2_147_483_647 ? page : 1,
      pageSize: pageSize === 50 || pageSize === 100 ? pageSize : 25,
    },
  };
}
