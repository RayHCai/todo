/**
 * Calendar-day helpers for the client. The browser's local time zone defines "today"; dates
 * travel to the server as `YYYY-MM-DD` and are never turned into timestamps.
 */
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type IsoDate = string;
/** A month key, `YYYY-MM`. */
export type MonthKey = string;

const WEEK = { weekStartsOn: 0 } as const;

/** Parses `YYYY-MM-DD` as local midnight. */
export const fromIso = (iso: IsoDate): Date => parseISO(iso);
export const toIso = (date: Date): IsoDate => format(date, "yyyy-MM-dd");

export const localToday = (now: Date = new Date()): IsoDate => toIso(now);
export const addDaysIso = (iso: IsoDate, days: number): IsoDate => toIso(addDays(fromIso(iso), days));
export const weekStartIso = (iso: IsoDate): IsoDate => toIso(startOfWeek(fromIso(iso), WEEK));
export const weekEndIso = (iso: IsoDate): IsoDate => toIso(endOfWeek(fromIso(iso), WEEK));
export const monthStartIso = (iso: IsoDate): IsoDate => `${iso.slice(0, 7)}-01`;
export const monthKey = (iso: IsoDate): MonthKey => iso.slice(0, 7);
export const daysBetween = (from: IsoDate, to: IsoDate): number => differenceInCalendarDays(fromIso(to), fromIso(from));

/** Milliseconds until the next local midnight, plus a small margin so the date has flipped. */
export function msUntilNextMidnight(now: Date = new Date()): number {
  return startOfDay(addDays(now, 1)).getTime() - now.getTime() + 250;
}

/** "Tue, Oct 6" */
export const dayLabel = (iso: IsoDate): string => format(fromIso(iso), "EEE, MMM d");
/** "Mon" */
export const weekdayShort = (iso: IsoDate): string => format(fromIso(iso), "EEE");
/** "Sep" */
export const monthShort = (iso: IsoDate): string => format(fromIso(iso), "MMM");
/** "October 2026" */
export const monthTitle = (iso: IsoDate): string => format(fromIso(iso), "MMMM yyyy");
/** "Tuesday, October 6" */
export const longDayLabel = (iso: IsoDate): string => format(fromIso(iso), "EEEE, MMMM d");

/** "Oct 4 – Oct 10", or "Sep 27 – Oct 3" when the week crosses a month. */
export function weekRangeLabel(weekStart: IsoDate): string {
  const start = fromIso(weekStart);
  const end = endOfWeek(start, WEEK);
  return `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
}

/** First and last day of a month, for `/api/history`. */
export function monthRange(key: MonthKey): { from: IsoDate; to: IsoDate } {
  const first = fromIso(`${key}-01`);
  return { from: toIso(first), to: toIso(endOfMonth(first)) };
}

export const shiftMonth = (key: MonthKey, by: number): MonthKey =>
  format(addMonths(fromIso(`${key}-01`), by), "yyyy-MM");

/** Sundays of every week that touches any day in `[firstMonth, lastMonth]`. */
export function weeksCovering(firstMonth: MonthKey, lastMonth: MonthKey): IsoDate[] {
  const start = startOfWeek(startOfMonth(fromIso(`${firstMonth}-01`)), WEEK);
  const end = endOfMonth(fromIso(`${lastMonth}-01`));
  const weeks: IsoDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) weeks.push(toIso(d));
  return weeks;
}

/** The seven days of the week starting at `weekStart`. */
export const daysOfWeek = (weekStart: IsoDate): IsoDate[] =>
  Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));

export const sameMonth = (a: IsoDate, b: IsoDate): boolean => isSameMonth(fromIso(a), fromIso(b));
