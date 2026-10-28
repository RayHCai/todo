/**
 * Pure operations on the cached `/api/lists` response, used by the Lists page and its
 * optimistic mutations.
 */
import { GOAL_COLORS, type GoalColor, type List, type ListsResponse, type ListTask } from "@todo/shared";
import { format } from "date-fns";
import { tmpId } from "./board";
import { addDaysIso, daysBetween, fromIso, weekdayShort, type IsoDate } from "./dates";

export type Lists = ListsResponse;

export const isDone = (task: ListTask): boolean => task.completedAt !== null;

export const tasksOf = (data: Lists, listId: string): ListTask[] => data.tasks.filter((t) => t.listId === listId);

export const openCount = (data: Lists, listId: string): number =>
  data.tasks.reduce((n, t) => (t.listId === listId && !isDone(t) ? n + 1 : n), 0);

export interface ListSections {
  /** Open tasks with a date, soonest first. */
  scheduled: ListTask[];
  /** Open tasks without a date, in the order they were added. */
  someday: ListTask[];
  /** Completed tasks, newest first. */
  done: ListTask[];
}

const byPosition = (a: ListTask, b: ListTask) => a.position - b.position || a.createdAt.localeCompare(b.createdAt);

export function sectionsOf(tasks: readonly ListTask[]): ListSections {
  const sections: ListSections = { scheduled: [], someday: [], done: [] };
  for (const t of tasks) {
    if (isDone(t)) sections.done.push(t);
    else if (t.date) sections.scheduled.push(t);
    else sections.someday.push(t);
  }
  sections.scheduled.sort((a, b) => a.date!.localeCompare(b.date!) || byPosition(a, b));
  sections.someday.sort(byPosition);
  sections.done.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  return sections;
}

export const isLate = (task: ListTask, today: IsoDate): boolean => !!task.date && !isDone(task) && task.date < today;

/** "Today", "Tomorrow", "Yesterday", a weekday within the coming week, otherwise "Oct 6". */
export function dueLabel(date: IsoDate, today: IsoDate): string {
  const n = daysBetween(today, date);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return weekdayShort(date);
  return format(fromIso(date), "MMM d");
}

/** The date popover's shortcuts. On a Saturday or Sunday, "This weekend" is today. */
export function quickDates(today: IsoDate): { label: string; date: IsoDate }[] {
  const weekday = fromIso(today).getDay();
  const toWeekend = weekday === 0 ? 0 : 6 - weekday;
  return [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDaysIso(today, 1) },
    { label: "This weekend", date: addDaysIso(today, toWeekend) },
    { label: "Next week", date: addDaysIso(today, 7) },
  ];
}

/** The first palette color no list uses yet, cycling once every color is taken. */
export function nextColor(used: readonly GoalColor[]): GoalColor {
  return GOAL_COLORS.find((c) => !used.includes(c)) ?? GOAL_COLORS[used.length % GOAL_COLORS.length]!;
}

/* ---------------- cache edits ---------------- */

export const withList = (data: Lists, list: List): Lists => ({ ...data, lists: [...data.lists, list] });

export const withoutList = (data: Lists, id: string): Lists => ({
  lists: data.lists.filter((l) => l.id !== id),
  tasks: data.tasks.filter((t) => t.listId !== id),
});

export const patchList = (data: Lists, id: string, patch: Partial<List>): Lists => ({
  ...data,
  lists: data.lists.map((l) => (l.id === id ? { ...l, ...patch } : l)),
});

/** Swaps a draft list for the server's copy, re-pointing tasks added to it in the meantime. */
export const replaceList = (data: Lists, id: string, list: List): Lists => ({
  lists: data.lists.map((l) => (l.id === id ? list : l)),
  tasks: data.tasks.map((t) => (t.listId === id ? { ...t, listId: list.id } : t)),
});

export const withTask = (data: Lists, task: ListTask): Lists => ({ ...data, tasks: [...data.tasks, task] });

export const withoutTask = (data: Lists, id: string): Lists => ({
  ...data,
  tasks: data.tasks.filter((t) => t.id !== id),
});

export const patchTask = (data: Lists, id: string, patch: Partial<ListTask>): Lists => ({
  ...data,
  tasks: data.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
});

/* ---------------- drafts ---------------- */

export function draftList(data: Lists, name: string, now: Date): List {
  const stamp = now.toISOString();
  return {
    id: tmpId(),
    name,
    color: nextColor(data.lists.map((l) => l.color)),
    position: data.lists.reduce((m, l) => Math.max(m, l.position), 0) + 1,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function draftTask(data: Lists, listId: string, title: string, now: Date): ListTask {
  const stamp = now.toISOString();
  return {
    id: tmpId(),
    listId,
    title,
    date: null,
    position: tasksOf(data, listId).reduce((m, t) => Math.max(m, t.position), 0) + 1,
    completedAt: null,
    completedOn: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
}
