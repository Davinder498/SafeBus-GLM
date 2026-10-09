import type { AdminTripDateSelection } from '@/types/adminTripSearch';

export const ALBERTA_TIME_ZONE = 'America/Edmonton';

export function albertaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ALBERTA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
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
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString(undefined, { timeZone, hour: 'numeric', minute: '2-digit' });
}
