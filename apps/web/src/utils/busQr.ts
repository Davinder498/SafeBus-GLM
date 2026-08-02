export const BUS_QR_PREFIX = 'sbus_bus_v1_';

export function isLikelyBusQrToken(value: string): boolean {
  return new RegExp(`^${BUS_QR_PREFIX}[A-Za-z0-9_-]{40,80}$`).test(value.trim());
}

export function mapBusQrStartError(message: string): string {
  if (message.includes('no run ready')) {
    return 'This bus does not have a run ready. Ask the transportation admin to prepare it.';
  }
  if (message.includes('already has an active trip')) {
    return 'This bus is already being tracked on another active trip.';
  }
  if (message.includes('active trip before scanning another bus')) {
    return 'End your current trip before scanning another bus.';
  }
  if (message.includes('not active')) {
    return 'This bus is not active. Contact the transportation admin.';
  }
  return 'This bus QR could not be verified or started.';
}
