/**
 * Where items appear on the board. Pure functions; the routes fetch candidate
 * rows and hand them here.
 *
 * - Active items roll forward: anything unfinished from an earlier window shows in the current
 *   one, flagged `carriedOver`, with its original date untouched.
 * - Completed items stay where they were checked off: their effective date is
 *   `max(scheduled date, completedOn)`, and they show in the list whose window contains it.
 */
import type { BoardDates, TodoScope } from "@todo/shared";
import { maxDate, startOfMonth, startOfWeek, type IsoDate } from "./dates";

export type TodoList = "today" | "tomorrow" | "week";

export type Placement<L extends string> =
  { list: L; section: "active"; carriedOver: boolean } | { list: L; section: "completed"; carriedOver: false };

export interface PlaceableTodo {
  scope: TodoScope;
  date: IsoDate;
  completedOn: IsoDate | null;
}

export interface PlaceableGoal {
  month: IsoDate;
  completedOn: IsoDate | null;
}

/** Returns the board list a todo belongs in, or `null` if it isn't on the board. */
export function placeTodo(todo: PlaceableTodo, dates: BoardDates): Placement<TodoList> | null {
  if (todo.completedOn === null) {
    if (todo.scope === "DAY") {
      if (todo.date <= dates.today) {
        return { list: "today", section: "active", carriedOver: todo.date < dates.today };
      }
      if (todo.date === dates.tomorrow) {
        return { list: "tomorrow", section: "active", carriedOver: false };
      }
      return null;
    }
    if (todo.date <= dates.weekStart) {
      return { list: "week", section: "active", carriedOver: todo.date < dates.weekStart };
    }
    return null;
  }

  const effective = maxDate(todo.date, todo.completedOn);
  if (todo.scope === "DAY") {
    if (effective === dates.today) return { list: "today", section: "completed", carriedOver: false };
    if (effective === dates.tomorrow) {
      return { list: "tomorrow", section: "completed", carriedOver: false };
    }
    return null;
  }
  if (startOfWeek(effective) === dates.weekStart) {
    return { list: "week", section: "completed", carriedOver: false };
  }
  return null;
}

/** Returns where a goal belongs in the carousel, or `null` if it isn't on the board. */
export function placeGoal(goal: PlaceableGoal, dates: BoardDates): Placement<"goals"> | null {
  if (goal.completedOn === null) {
    if (goal.month <= dates.month) {
      return { list: "goals", section: "active", carriedOver: goal.month < dates.month };
    }
    return null;
  }
  if (startOfMonth(maxDate(goal.month, goal.completedOn)) === dates.month) {
    return { list: "goals", section: "completed", carriedOver: false };
  }
  return null;
}

interface Sortable {
  position: number;
  createdAt: string;
  completedAt: string | null;
}

/** Active items by `position` ascending (oldest first on ties). */
export function compareActive(a: Sortable, b: Sortable): number {
  return a.position - b.position || a.createdAt.localeCompare(b.createdAt);
}

/** Completed items newest first. */
export function compareCompleted(a: Sortable, b: Sortable): number {
  return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
}

export interface Sections<T> {
  active: T[];
  completed: T[];
}

export interface BoardLists<TTodo, TGoal> {
  goals: Sections<TGoal>;
  today: Sections<TTodo>;
  tomorrow: Sections<TTodo>;
  week: Sections<TTodo>;
}

type WithCarry<T> = T & { carriedOver: boolean };

/**
 * Distributes candidate items into board lists, sets `carriedOver`, and sorts each section.
 * Items that belong nowhere on the board are dropped.
 */
export function composeBoard<TTodo extends PlaceableTodo & Sortable, TGoal extends PlaceableGoal & Sortable>(
  dates: BoardDates,
  todos: readonly TTodo[],
  goals: readonly TGoal[],
): BoardLists<WithCarry<TTodo>, WithCarry<TGoal>> {
  const empty = <T>(): Sections<T> => ({ active: [], completed: [] });
  const board: BoardLists<WithCarry<TTodo>, WithCarry<TGoal>> = {
    goals: empty(),
    today: empty(),
    tomorrow: empty(),
    week: empty(),
  };

  for (const todo of todos) {
    const placement = placeTodo(todo, dates);
    if (placement) {
      board[placement.list][placement.section].push({ ...todo, carriedOver: placement.carriedOver });
    }
  }
  for (const goal of goals) {
    const placement = placeGoal(goal, dates);
    if (placement) {
      board.goals[placement.section].push({ ...goal, carriedOver: placement.carriedOver });
    }
  }

  for (const sections of [board.goals, board.today, board.tomorrow, board.week]) {
    (sections.active as Sortable[]).sort(compareActive);
    (sections.completed as Sortable[]).sort(compareCompleted);
  }
  return board;
}
