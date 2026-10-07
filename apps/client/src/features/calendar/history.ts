/**
 * Groups `/api/history` rows by day, week and month for the calendar. The server does no
 * grouping; these rules decide where each item shows.
 */
import type { Goal, HistoryResponse, Todo } from "@todo/shared";
import { maxIso } from "./util";
import { monthKey, weekStartIso, type IsoDate, type MonthKey } from "../../lib/dates";

export interface DayEntry {
  completed: Todo[];
  /** Planned for this day but finished later, or never finished and the day has passed. */
  missed: Todo[];
  open: Todo[];
  /** DAY todos scheduled for this day (the meter's denominator). */
  scheduled: number;
  /** Of those, how many were done by the end of the day. */
  doneOnTime: number;
  /** Everything completed on this day, any scope (the heatmap). */
  completions: number;
}

export interface HistoryIndex {
  days: Map<IsoDate, DayEntry>;
  weeks: Map<IsoDate, { done: Todo[]; open: Todo[] }>;
  months: Map<MonthKey, Goal[]>;
}

const emptyDay = (): DayEntry => ({ completed: [], missed: [], open: [], scheduled: 0, doneOnTime: 0, completions: 0 });

export function indexHistory(pages: (HistoryResponse | undefined)[], today: IsoDate): HistoryIndex {
  const todos = new Map<string, Todo>();
  const goals = new Map<string, Goal>();
  for (const page of pages) {
    page?.todos.forEach((t) => todos.set(t.id, t));
    page?.goals.forEach((g) => goals.set(g.id, g));
  }

  const days = new Map<IsoDate, DayEntry>();
  const day = (d: IsoDate) => {
    let e = days.get(d);
    if (!e) days.set(d, (e = emptyDay()));
    return e;
  };
  const weeks = new Map<IsoDate, { done: Todo[]; open: Todo[] }>();
  const week = (w: IsoDate) => {
    let e = weeks.get(w);
    if (!e) weeks.set(w, (e = { done: [], open: [] }));
    return e;
  };

  for (const t of todos.values()) {
    if (t.completedOn) day(t.completedOn).completions++;
    if (t.scope === "WEEK") {
      if (t.completedOn) week(weekStartIso(maxIso(t.date, t.completedOn))).done.push(t);
      else week(t.date).open.push(t);
      continue;
    }
    const scheduled = day(t.date);
    scheduled.scheduled++;
    if (t.completedOn) {
      const effective = maxIso(t.date, t.completedOn);
      day(effective).completed.push(t);
      if (t.completedOn <= t.date) scheduled.doneOnTime++;
      else scheduled.missed.push(t);
    } else if (t.date < today) {
      scheduled.missed.push(t);
    } else {
      scheduled.open.push(t);
    }
  }

  const months = new Map<MonthKey, Goal[]>();
  for (const g of goals.values()) {
    const key = monthKey(g.completedOn ? maxIso(g.month, g.completedOn) : g.month);
    const list = months.get(key) ?? [];
    list.push(g);
    months.set(key, list);
  }
  for (const list of months.values()) list.sort((a, b) => a.position - b.position);

  return { days, weeks, months };
}
