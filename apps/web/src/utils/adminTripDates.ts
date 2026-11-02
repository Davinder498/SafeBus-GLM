import type { AdminTripDateSelection } from '@/types/adminTripSearch';
import moment from 'moment-timezone/moment-timezone';
import edmontonTimezone from '@/data/edmontonTimezone.json';

// One zone from pinned moment-timezone (MIT), IANA 2026f; avoid shipping the world's zone data.
moment.tz.load(edmontonTimezone);

export const ALBERTA_TIME_ZONE = 'America/Edmonton';

export function albertaToday(now = new Date()): string {
  return moment(now).tz(ALBERTA_TIME_ZONE).format('YYYY-MM-DD');
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function adminTripDateBounds(selection: AdminTripDateSelection, now = new Date()) {
  if (selection.mode === 'all') return { fromDate: null, toDate: null };
  const fromDate =
    selection.mode === 'today'
      ? albertaToday(now)
      : selection.mode === 'date'
        ? selection.date
        : selection.fromDate;
  const toDate = selection.mode === 'range' ? selection.toDate : fromDate;
  if (!validDate(fromDate) || !validDate(toDate)) throw new Error('Choose a valid date.');
  if (fromDate > toDate) throw new Error('The end date must be on or after the start date.');
  return { fromDate, toDate };
}

export function formatAdminTripDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { timeZone: 'UTC', dateStyle: 'medium' });
}

export function formatAdminTripTime(value: string, timeZone?: string): string {
  const date = new Date(value);
  if (timeZone === ALBERTA_TIME_ZONE)
    return Number.isNaN(date.getTime())
      ? 'Unavailable'
      : moment(date).tz(timeZone).format('h:mm A');
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString(undefined, { timeZone, hour: 'numeric', minute: '2-digit' });
}

/** Bundled IANA data avoids dependence on browser/OS timezone updates. */
export function formatAdminTripTimestamp(value: string, timeZone = ALBERTA_TIME_ZONE): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'Not recorded';
  return moment(date).tz(timeZone).format('YYYY-MM-DD h:mm A [UTC]Z');
}
