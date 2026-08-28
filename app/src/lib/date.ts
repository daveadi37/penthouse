import type { DateStr, TimeStr } from '@/types';

export const DOW = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MON = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Date object → `YYYY-MM-DD`, in local time. */
export function ds(d: Date = new Date()): DateStr {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/** `YYYY-MM-DD` → Date at midday, so DST never shifts the day. */
export function pd(s: DateStr): Date {
  return new Date(s + 'T12:00:00');
}

export const today = (): DateStr => ds(new Date());

export function fmt(s: DateStr): string {
  const d = pd(s);
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtMedium(s: DateStr): string {
  const d = pd(s);
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtShort(s: DateStr): string {
  const d = pd(s);
  return `${d.getDate()} ${MON[d.getMonth()].slice(0, 3)}`;
}

export function fmtDow(s: DateStr): string {
  return DOW[pd(s).getDay()];
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = pd(s);
  d.setDate(d.getDate() + n);
  return ds(d);
}

export function addMonths(s: DateStr, n: number): DateStr {
  const d = pd(s);
  d.setMonth(d.getMonth() + n);
  return ds(d);
}

export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((pd(b).getTime() - pd(a).getTime()) / 864e5);
}

/** Monday-anchored week start. */
export function weekStart(s: DateStr): DateStr {
  const d = pd(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ds(d);
}

export function monthStart(s: DateStr): DateStr {
  const d = pd(s);
  d.setDate(1);
  return ds(d);
}

export function monthKey(s: DateStr): string {
  return s.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MON[Number(m) - 1]} ${y}`;
}

/** Fortnightly alternation, measured from the settings epoch. */
export function parityOf(s: DateStr, epoch: DateStr): 0 | 1 {
  const n = Math.floor(diffDays(epoch, s) / 7);
  return (((n % 2) + 2) % 2) as 0 | 1;
}

export function timeAgo(t?: number): string {
  if (!t) return '';
  const m = Math.floor((Date.now() - t) / 6e4);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function hhmm(t: number): TimeStr {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const toMinutes = (t: TimeStr): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const fromMinutes = (n: number): TimeStr => {
  const c = Math.max(0, Math.min(24 * 60 - 1, Math.round(n)));
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
};

/** 14:30 → "2:30pm". Used in dense timeline labels. */
export function fmtTime12(t: TimeStr): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, '0')}${suffix}` : `${hr}${suffix}`;
}

export function durationLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Inclusive list of dates. */
export function range(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  let c = from;
  let guard = 0;
  while (c <= to && guard++ < 1000) {
    out.push(c);
    c = addDays(c, 1);
  }
  return out;
}

export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Days until a date; negative means it has passed. */
export const daysUntil = (s: DateStr): number => diffDays(today(), s);

export function overlaps(
  aStart: TimeStr,
  aEnd: TimeStr,
  bStart: TimeStr,
  bEnd: TimeStr,
): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}
