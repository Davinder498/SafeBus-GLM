export const DRIVER_LOCATION_NOTICE_VERSION = 'driver-location-byod-v1';
export const DRIVER_LOCATION_NOTICE_STORAGE_KEY = 'safebus.driverLocationNoticeVersion';

export const DRIVER_LOCATION_DISCLOSURE =
  'SafeBus collects precise location data to show the active bus to authorized school staff and linked guardians even when the app is closed or not in use.';

export function needsDriverLocationDisclosure(storedVersion: string | null): boolean {
  return storedVersion !== DRIVER_LOCATION_NOTICE_VERSION;
}
