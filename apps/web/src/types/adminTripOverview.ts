export type AdminTripStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type AdminTripDirection = 'outbound' | 'return';
export type AdminTripFilter =
  'all' | 'active' | 'paused' | 'non-active' | 'completed' | 'cancelled';

export interface AdminTripOverviewItem {
  id: string;
  serviceDate: string;
  status: AdminTripStatus;
  startedAt: string;
  endedAt: string | null;
  routeName: string;
  routeCode: string;
  tripPatternName: string;
  direction: AdminTripDirection;
  busLabel: string;
  driverLabel: string;
}
