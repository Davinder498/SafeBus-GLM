export interface DriverCompletedTripHistoryItem {
  id: string;
  serviceDate: string;
  startedAt: string;
  endedAt: string;
  routeName: string;
  routeCode: string;
  tripName: string;
  direction: 'forward' | 'reverse';
  busNumber: string;
}
