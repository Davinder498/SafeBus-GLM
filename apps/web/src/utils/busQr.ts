export const BUS_QR_PREFIX = 'sbus_bus_v1_';

export function isLikelyBusQrToken(value: string): boolean {
  return new RegExp(`^${BUS_QR_PREFIX}[A-Za-z0-9_-]{40,80}$`).test(value.trim());
}

export function mapBusQrStartError(message: string): string {
  if (message.includes('route direction is not assigned') || message.includes('not active today')) {
    return 'That route direction is no longer available for this bus. Scan again to refresh.';
  }
  if (message.includes('already has an active trip')) {
    return 'This bus is already being tracked on another active trip.';
  }
  if (message.includes('active trip before scanning another bus')) {
    return 'End your current trip before scanning another bus.';
  }
  if (message.includes('direction cannot be changed')) {
    return 'Resume the route direction already in progress, or end it before choosing another.';
  }
  if (message.includes('not active')) {
    return 'This bus is not active. Contact the transportation admin.';
  }
  return 'This bus QR could not be verified or started.';
}
