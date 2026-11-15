export function validBusTrackingTopic(value: unknown): value is string {
  return typeof value === 'string' && /^safebus:bus:[a-f0-9]{64}$/.test(value);
}
