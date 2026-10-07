/**
 * Calendar-day math on `YYYY-MM-DD` strings.
 *
 * Days are the user's local calendar days, so everything here works in UTC purely as a
 * time-zone-free calendar: a date string maps to UTC midnight and back, never to a real instant.
 * Because the format is fixed-width, two date strings compare correctly with `<` and `>`.
 */
import type { BoardDates } from "@todo/shared";

export type IsoDate = string;

const MS_PER_DAY = 86_400_000;

function toUtc(date: IsoDate): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(date)) {
    throw new RangeError(`Invalid date: ${date}`);
  }
  return parsed;
}

function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(new Date(toUtc(date).getTime() + days * MS_PER_DAY));
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / MS_PER_DAY);
}

/** The Sunday that starts the (Sunday–Saturday) week containing `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -toUtc(date).getUTCDay());
}

/** The Saturday that ends the week containing `date`. */
export function endOfWeek(date: IsoDate): IsoDate {
  return addDays(startOfWeek(date), 6);
}

/** The 1st of the month containing `date`. */
export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

/** A WEEK todo is stored on the Sunday that starts its week; a DAY todo on its own day. */
export function normalizeTodoDate(scope: "DAY" | "WEEK", date: IsoDate): IsoDate {
  return scope === "WEEK" ? startOfWeek(date) : date;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b;
}

/** Every date the board needs, derived from the client's local "today". */
export function boardDates(today: IsoDate): BoardDates {
  toUtc(today); // validate
  return {
    today,
    tomorrow: addDays(today, 1),
    weekStart: startOfWeek(today),
    weekEnd: endOfWeek(today),
    month: startOfMonth(today),
  };
}

/** Converts a date string to the value Prisma writes into a `@db.Date` column. */
export function toDbDate(date: IsoDate): Date {
  return toUtc(date);
}

/** Converts a `@db.Date` value read by Prisma (UTC midnight) back to a date string. */
export function fromDbDate(date: Date): IsoDate {
  return fromUtc(date);
}
