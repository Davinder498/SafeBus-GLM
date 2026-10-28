import type { AdminTripOverviewItem } from './adminTripOverview';
import type { LocationFreshness } from './adminLiveMonitoring';
import type { RouteShapeGeoJson } from './transportation';

export interface AdminTripOperation extends AdminTripOverviewItem {
  locationStatus: LocationFreshness | 'not_applicable';
  latestLocationAt: string | null;
  etaLabel: string | null;
  nextStopName: string | null;
}

export interface AdminTripStop {
  id: string;
  name: string;
  order: number;
  latitude: number | null;
  longitude: number | null;
  plannedTime: string | null;
}

export interface AdminTripStudent {
  id: string;
  name: string;
  school: string | null;
  pickupStop: string | null;
  dropoffStop: string | null;
  seat: number | null;
  hasAssignment: boolean;
  assignmentStatus: string | null;
  pickedUpAt: string | null;
  droppedOffAt: string | null;
}

export interface AdminTripDetail {
  trip: AdminTripOverviewItem;
  stops: AdminTripStop[];
  students: AdminTripStudent[];
  shape: { geojson: RouteShapeGeoJson; version: number; basis: 'trip' | 'current' } | null;
  location: {
    latitude: number;
    longitude: number;
    recordedAt: string;
    speedMps: number | null;
    accuracyM: number | null;
    state: LocationFreshness;
  } | null;
  mapColor: string | null;
  eta: { label: string | null; nextStop: string | null } | null;
}
