export const STUDENT_QR_PREFIX = 'sbus_qr_v1_';
export type StudentQrTripStatus = 'not_picked_up' | 'picked_up' | 'dropped_off';

export function isLikelyStudentQrToken(value: string): boolean {
  return new RegExp(`^${STUDENT_QR_PREFIX}[A-Za-z0-9_-]{40,80}$`).test(value.trim());
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getNextStudentQrAction(status: StudentQrTripStatus): 'pickup' | 'dropoff' | 'complete' {
  if (status === 'not_picked_up') return 'pickup';
  if (status === 'picked_up') return 'dropoff';
  return 'complete';
}

export function mapStudentQrError(): string {
  return 'Badge could not be verified for this active trip.';
}

export function shouldProcessScan(lastValue: string | null, nextValue: string, lastAt: number, now: number, debounceMs = 2500): boolean {
  return !(lastValue === nextValue && now - lastAt < debounceMs);
}
