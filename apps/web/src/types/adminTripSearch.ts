import type { AdminTripStatus } from '@/types/adminTripOverview';
import type { AdminPageSize } from '@/types/pagination';

export type AdminTripDateMode = 'today' | 'date' | 'range' | 'all';

export interface AdminTripSearchQuery {
  fromDate: string | null;
  toDate: string | null;
  status: AdminTripStatus | null;
  page: number;
  pageSize: AdminPageSize;
}

export interface AdminTripDateSelection {
  mode: AdminTripDateMode;
  date: string;
  fromDate: string;
  toDate: string;
}
