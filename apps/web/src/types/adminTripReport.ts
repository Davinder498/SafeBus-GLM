import type { AdminTripSearchQuery } from './adminTripSearch';
import type { AdminTripOverviewItem } from './adminTripOverview';
import type { TripExceptionType } from './tripExceptions';

export type AdminTripReportView = 'history' | 'exceptions' | 'dispatch';
export interface AdminTripReportQuery extends AdminTripSearchQuery {
  view: AdminTripReportView;
  exceptionType: TripExceptionType | null;
  flag: 'late' | 'missing' | null;
}
export interface AdminTripEvidence {
  id: string;
  trip: AdminTripOverviewItem;
  category: string;
  recordedAt: string;
  reason: string | null;
}
