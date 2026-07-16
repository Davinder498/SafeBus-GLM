import { describe, expect, it } from 'vitest';
import { getNextStudentQrAction, isLikelyStudentQrToken, mapStudentQrError, sha256Hex, shouldProcessScan, STUDENT_QR_PREFIX } from './studentQr';

describe('student QR utilities', () => {
  it('validates opaque token format without accepting malformed values', () => {
    expect(isLikelyStudentQrToken(`${STUDENT_QR_PREFIX}${'A'.repeat(43)}`)).toBe(true);
    expect(isLikelyStudentQrToken('student-id-or-json')).toBe(false);
  });
  it('hashes tokens with sha-256 hex', async () => {
    await expect(sha256Hex('abc')).resolves.toHaveLength(64);
  });
  it('selects pickup, dropoff, and complete actions', () => {
    expect(getNextStudentQrAction('not_picked_up')).toBe('pickup');
    expect(getNextStudentQrAction('picked_up')).toBe('dropoff');
    expect(getNextStudentQrAction('dropped_off')).toBe('complete');
  });
  it('debounces repeated scans and maps invalid errors generically', () => {
    expect(shouldProcessScan('x', 'x', 1000, 1200)).toBe(false);
    expect(shouldProcessScan('x', 'y', 1000, 1200)).toBe(true);
    expect(mapStudentQrError()).not.toMatch(/tenant|student exists/i);
  });
});
