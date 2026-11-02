import { describe, expect, it } from 'vitest';
import {
  adminTripDateBounds,
  albertaToday,
  ALBERTA_TIME_ZONE,
  formatAdminTripDate,
  formatAdminTripTime,
  formatAdminTripTimestamp,
} from '@/utils/adminTripDates';

describe('Alberta trip service dates', () => {
  it('uses Alberta today across midnight and daylight-saving boundaries', () => {
    expect(albertaToday(new Date('2026-10-09T05:30:00Z'))).toBe('2026-10-08');
    expect(albertaToday(new Date('2026-10-09T06:30:00Z'))).toBe('2026-10-09');
    expect(albertaToday(new Date('2026-01-09T06:30:00Z'))).toBe('2026-01-08');
    expect(albertaToday(new Date('2026-03-08T08:59:00Z'))).toBe('2026-03-08');
    expect(albertaToday(new Date('2026-03-08T09:01:00Z'))).toBe('2026-03-08');
  });

  it('maps one date, inclusive ranges and all dates without UTC conversions', () => {
    const selection = {
      mode: 'date' as const,
      date: '2024-02-29',
      fromDate: '2025-01-14',
      toDate: '2025-01-15',
    };
    expect(adminTripDateBounds(selection)).toEqual({
      fromDate: '2024-02-29',
      toDate: '2024-02-29',
    });
    expect(adminTripDateBounds({ ...selection, mode: 'range' })).toEqual({
      fromDate: '2025-01-14',
      toDate: '2025-01-15',
    });
    expect(adminTripDateBounds({ ...selection, mode: 'all', date: '' })).toEqual({
      fromDate: null,
      toDate: null,
    });
    expect(
      adminTripDateBounds({ ...selection, mode: 'today' }, new Date('2026-10-09T05:30:00Z')),
    ).toEqual({ fromDate: '2026-10-08', toDate: '2026-10-08' });
  });

  it('rejects missing dates, impossible dates, and reversed ranges', () => {
    const selection = {
      mode: 'date' as const,
      date: '',
      fromDate: '2025-01-15',
      toDate: '2025-01-14',
    };
    expect(() => adminTripDateBounds(selection)).toThrow('valid date');
    expect(() => adminTripDateBounds({ ...selection, date: '2025-02-29' })).toThrow('valid date');
    expect(() => adminTripDateBounds({ ...selection, date: '2026-02-30' })).toThrow('valid date');
    expect(() => adminTripDateBounds({ ...selection, mode: 'range' })).toThrow('end date');
  });

  it('formats recorded timestamps with bundled historical and current Alberta rules', () => {
    expect(formatAdminTripTime('2026-01-09T14:30:00Z', ALBERTA_TIME_ZONE)).toBe('7:30 AM');
    expect(formatAdminTripTime('2026-07-09T14:30:00Z', ALBERTA_TIME_ZONE)).toBe('8:30 AM');
    expect(formatAdminTripTimestamp('2026-03-08T08:59:00Z')).toBe('2026-03-08 1:59 AM UTC-07:00');
    expect(formatAdminTripTimestamp('2026-03-08T09:01:00Z')).toBe('2026-03-08 3:01 AM UTC-06:00');
    expect(formatAdminTripTimestamp('2025-11-02T07:30:00Z')).toBe('2025-11-02 1:30 AM UTC-06:00');
    expect(formatAdminTripTimestamp('2025-11-02T08:30:00Z')).toBe('2025-11-02 1:30 AM UTC-07:00');
    expect(formatAdminTripTimestamp('2026-11-02T14:00:00Z')).toBe('2026-11-02 8:00 AM UTC-06:00');
    expect(formatAdminTripTimestamp('2026-11-02T05:59:00Z')).toBe('2026-11-01 11:59 PM UTC-06:00');
    expect(albertaToday(new Date('2026-11-02T06:30:00Z'))).toBe('2026-11-02');
    expect(formatAdminTripTimestamp('invalid')).toBe('Not recorded');
    expect(formatAdminTripTime('invalid', ALBERTA_TIME_ZONE)).toBe('Unavailable');
    expect(formatAdminTripDate('2026-01-09')).toBe(
      new Date('2026-01-09T12:00:00Z').toLocaleDateString(undefined, {
        timeZone: 'UTC',
        dateStyle: 'medium',
      }),
    );
  });
});
