export type TripStatus = 'scheduled' | 'active' | 'delayed' | 'completed';
export type GpsStatus = 'live' | 'stale' | 'offline';
export type RouteDirection = 'AM' | 'PM';
export type AlertSeverity = 'urgent' | 'warning' | 'info';

export interface Bus {
  id: string;
  busNumber: string;
  capacity: number;
  status: 'active' | 'maintenance';
}

export interface RouteStop {
  id: string;
  name: string;
  sequence: number;
  scheduledTime: string;
  status: 'complete' | 'current' | 'upcoming';
}

export interface Route {
  id: string;
  name: string;
  direction: RouteDirection;
  school: string;
  stops: RouteStop[];
}

export interface Trip {
  id: string;
  route: Route;
  bus: Bus;
  driverName: string;
  status: TripStatus;
  scheduledStart: string;
  tripDate: string;
  pickedUp: number;
  droppedOff: number;
  totalStudents: number;
  manualOverrides: number;
  gpsStatus: GpsStatus;
  lastUpdated: string;
}

export interface Student {
  id: string;
  firstName: string;
  lastInitial: string;
  grade: string;
  school: string;
}

export interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  busNumber?: string;
  routeName?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'pickup' | 'dropoff' | 'delay' | 'gps_unavailable' | 'trip_started';
}

export interface TimelineEvent {
  id: string;
  time: string;
  label: string;
  detail: string;
  status: 'complete' | 'current' | 'upcoming';
}

export const mockBuses: Bus[] = [
  { id: 'b1', busNumber: '12', capacity: 48, status: 'active' },
  { id: 'b2', busNumber: '104', capacity: 54, status: 'active' },
  { id: 'b3', busNumber: '7', capacity: 36, status: 'active' },
  { id: 'b4', busNumber: '23', capacity: 48, status: 'maintenance' },
];

export const mockRoutes: Route[] = [
  {
    id: 'r1',
    name: 'North Ridge AM',
    direction: 'AM',
    school: 'Maple Creek School',
    stops: [
      { id: 's1', name: 'Elm & 4th', sequence: 1, scheduledTime: '7:45 AM', status: 'complete' },
      { id: 's2', name: 'Oak & 9th', sequence: 2, scheduledTime: '7:52 AM', status: 'current' },
      { id: 's3', name: 'Maple & 12th', sequence: 3, scheduledTime: '7:58 AM', status: 'upcoming' },
      {
        id: 's4',
        name: 'Maple Creek School',
        sequence: 4,
        scheduledTime: '8:10 AM',
        status: 'upcoming',
      },
    ],
  },
  {
    id: 'r2',
    name: 'North Ridge PM',
    direction: 'PM',
    school: 'Maple Creek School',
    stops: [
      {
        id: 's5',
        name: 'Maple Creek School',
        sequence: 1,
        scheduledTime: '3:15 PM',
        status: 'upcoming',
      },
      { id: 's6', name: 'Maple & 12th', sequence: 2, scheduledTime: '3:22 PM', status: 'upcoming' },
      { id: 's7', name: 'Oak & 9th', sequence: 3, scheduledTime: '3:28 PM', status: 'upcoming' },
      { id: 's8', name: 'Elm & 4th', sequence: 4, scheduledTime: '3:35 PM', status: 'upcoming' },
    ],
  },
  {
    id: 'r3',
    name: 'Riverside AM',
    direction: 'AM',
    school: 'Maple Creek School',
    stops: [
      {
        id: 's9',
        name: 'River Rd & 1st',
        sequence: 1,
        scheduledTime: '7:40 AM',
        status: 'complete',
      },
      { id: 's10', name: 'Brookside', sequence: 2, scheduledTime: '7:48 AM', status: 'current' },
      {
        id: 's11',
        name: 'Maple Creek School',
        sequence: 3,
        scheduledTime: '8:05 AM',
        status: 'upcoming',
      },
    ],
  },
];

export const mockTrips: Trip[] = [
  {
    id: 't1',
    route: mockRoutes[0],
    bus: mockBuses[0],
    driverName: 'Demo Driver',
    status: 'active',
    scheduledStart: '7:45 AM',
    tripDate: '2026-06-30',
    pickedUp: 18,
    droppedOff: 0,
    totalStudents: 24,
    manualOverrides: 1,
    gpsStatus: 'live',
    lastUpdated: '15 seconds ago',
  },
  {
    id: 't2',
    route: mockRoutes[2],
    bus: mockBuses[1],
    driverName: 'Pat Morgan',
    status: 'delayed',
    scheduledStart: '7:40 AM',
    tripDate: '2026-06-30',
    pickedUp: 12,
    droppedOff: 0,
    totalStudents: 30,
    manualOverrides: 0,
    gpsStatus: 'stale',
    lastUpdated: '45 seconds ago',
  },
  {
    id: 't3',
    route: mockRoutes[1],
    bus: mockBuses[2],
    driverName: 'Sam Lee',
    status: 'scheduled',
    scheduledStart: '3:15 PM',
    tripDate: '2026-06-30',
    pickedUp: 0,
    droppedOff: 0,
    totalStudents: 22,
    manualOverrides: 0,
    gpsStatus: 'offline',
    lastUpdated: 'Not started',
  },
];

export const mockStudent: Student = {
  id: 'stu1',
  firstName: 'Avery',
  lastInitial: 'K.',
  grade: 'Grade 4',
  school: 'Maple Creek School',
};

export const mockAlerts: Alert[] = [
  {
    id: 'a1',
    severity: 'warning',
    message: 'GPS signal stale for Bus 104',
    busNumber: '104',
    routeName: 'Riverside AM',
    createdAt: '2 min ago',
  },
  {
    id: 'a2',
    severity: 'warning',
    message: 'Route Riverside AM is delayed due to traffic near Highway 2A',
    busNumber: '104',
    routeName: 'Riverside AM',
    createdAt: '5 min ago',
  },
  {
    id: 'a3',
    severity: 'info',
    message: 'Manual pickup confirmation recorded on Bus 12',
    busNumber: '12',
    routeName: 'North Ridge AM',
    createdAt: '8 min ago',
  },
];

export const mockNotifications: Notification[] = [
  {
    id: 'n1',
    title: 'Picked up',
    message: 'Avery was picked up at 7:52 AM.',
    time: '7:52 AM',
    type: 'pickup',
  },
  {
    id: 'n2',
    title: 'Trip started',
    message: 'Bus 12 has started the North Ridge AM route.',
    time: '7:45 AM',
    type: 'trip_started',
  },
  {
    id: 'n3',
    title: 'Location unavailable',
    message: 'Bus location was temporarily unavailable. Last update was 7:50 AM.',
    time: '7:50 AM',
    type: 'gps_unavailable',
  },
];

export const mockTimeline: TimelineEvent[] = [
  {
    id: 'e1',
    time: '7:45 AM',
    label: 'Trip started',
    detail: 'Bus 12 began the morning route.',
    status: 'complete',
  },
  {
    id: 'e2',
    time: '7:52 AM',
    label: 'Pickup confirmed',
    detail: 'Avery boarded at the assigned stop.',
    status: 'complete',
  },
  {
    id: 'e3',
    time: 'Now',
    label: 'On route',
    detail: 'Bus is travelling toward Maple Creek School.',
    status: 'current',
  },
  {
    id: 'e4',
    time: '8:10 AM',
    label: 'Drop-off pending',
    detail: 'Confirmation will appear when completed.',
    status: 'upcoming',
  },
];

export const adminMetrics = {
  activeTrips: mockTrips.filter((trip) => trip.status === 'active').length,
  delayedBuses: mockTrips.filter((trip) => trip.status === 'delayed').length,
  staleGpsBuses: mockTrips.filter(
    (trip) => trip.gpsStatus === 'stale' || trip.gpsStatus === 'offline',
  ).length,
  studentsPickedUp: mockTrips.reduce((sum, trip) => sum + trip.pickedUp, 0),
  studentsDroppedOff: mockTrips.reduce((sum, trip) => sum + trip.droppedOff, 0),
  manualOverrides: mockTrips.reduce((sum, trip) => sum + trip.manualOverrides, 0),
};

export const mockParentBus = mockBuses[0];
export const mockParentRoute = mockRoutes[0];
export const mockParentTrip = mockTrips[0];
export const mockDriverTrip = mockTrips[0];
