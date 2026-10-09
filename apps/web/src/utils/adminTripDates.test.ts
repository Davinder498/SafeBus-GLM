import { describe, expect, it } from 'vitest';
import {
  adminTripDateBounds,
  albertaToday,
  ALBERTA_TIME_ZONE,
  formatAdminTripDate,
  formatAdminTripTime,
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

  it('formats timestamps in Alberta time and leaves service dates as calendar dates', () => {
    const winter = '2026-01-09T14:30:00Z';
    const summer = '2026-07-09T14:30:00Z';
    const expected = (value: string) =>
      new Date(value).toLocaleTimeString(undefined, {
        timeZone: ALBERTA_TIME_ZONE,
        hour: 'numeric',
        minute: '2-digit',
      });
    expect(formatAdminTripTime(winter, ALBERTA_TIME_ZONE)).toBe(expected(winter));
    expect(formatAdminTripTime(summer, ALBERTA_TIME_ZONE)).toBe(expected(summer));
    expect(formatAdminTripDate('2026-01-09')).toBe(
      new Date('2026-01-09T12:00:00Z').toLocaleDateString(undefined, {
        timeZone: 'UTC',
        dateStyle: 'medium',
      }),
    );
    expect(formatAdminTripTime('invalid', ALBERTA_TIME_ZONE)).toBe('invalid');
  });
});
