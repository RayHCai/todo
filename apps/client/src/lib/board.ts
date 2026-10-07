/**
 * Pure operations on the cached `/api/board` response, used by optimistic mutations.
 * The client never re-implements carry-over rules: items only move between `active` and
 * `completed` within a list, or between lists when the user moves them explicitly.
 */
import type { BoardDates, BoardResponse, Goal, GoalColor, Todo, TodoScope } from "@todo/shared";

export type Board = BoardResponse;
export type ListKey = "goals" | "today" | "tomorrow" | "week";
export type ItemType = "today" | "tomorrow" | "week" | "goal";
export type Item = Todo | Goal;
export type Section = "active" | "completed";

export const LIST_KEYS: readonly ListKey[] = ["goals", "today", "tomorrow", "week"];
export const COLUMN_KEYS = ["today", "tomorrow", "week"] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export const isGoal = (item: Item): item is Goal => "month" in item;
export const listOfType = (type: ItemType): ListKey => (type === "goal" ? "goals" : type);
export const typeOfList = (list: ListKey): ItemType => (list === "goals" ? "goal" : list);

export interface Location {
  list: ListKey;
  section: Section;
  index: number;
  item: Item;
}

export function locate(board: Board, id: string): Location | null {
  for (const list of LIST_KEYS) {
    for (const section of ["active", "completed"] as const) {
      const items: Item[] = board[list][section];
      const index = items.findIndex((i) => i.id === id);
      if (index >= 0) return { list, section, index, item: items[index]! };
    }
  }
  return null;
}

function setList(board: Board, list: ListKey, section: Section, items: Item[]): Board {
  return { ...board, [list]: { ...board[list], [section]: items } } as Board;
}

const byPosition = (a: Item, b: Item) => a.position - b.position;

export function withoutItem(board: Board, id: string): Board {
  const at = locate(board, id);
  if (!at) return board;
  const items: Item[] = board[at.list][at.section].filter((i: Item) => i.id !== id);
  return setList(board, at.list, at.section, items);
}

/** Adds an item to a list's active section, keeping position order. */
export function withActive(board: Board, list: ListKey, item: Item): Board {
  const items: Item[] = [...board[list].active, item].sort(byPosition);
  return setList(board, list, "active", items);
}

export function withReplacedItem(board: Board, id: string, item: Item): Board {
  const at = locate(board, id);
  if (!at) return board;
  const items: Item[] = [...board[at.list][at.section]];
  items[at.index] = item;
  return setList(board, at.list, at.section, items);
}

/** Moves an item between the active and completed sections of the list it is already in. */
export function withCompletion(board: Board, id: string, completed: boolean, completedOn: string, now: Date): Board {
  const at = locate(board, id);
  if (!at) return board;
  const wasCompleted = at.section === "completed";
  if (wasCompleted === completed) return board;
  const updated: Item = completed
    ? { ...at.item, completedAt: now.toISOString(), completedOn, carriedOver: false }
    : { ...at.item, completedAt: null, completedOn: null };
  const removed = withoutItem(board, id);
  if (completed) {
    return setList(removed, at.list, "completed", [updated, ...removed[at.list].completed]);
  }
  return withActive(removed, at.list, updated);
}

/** Where a todo with this scope/date shows on the board, or null if it falls outside it. */
export function listForTodo(dates: BoardDates, scope: TodoScope, date: string): ColumnKey | null {
  if (scope === "WEEK") return date <= dates.weekStart ? "week" : null;
  if (date <= dates.today) return "today";
  if (date === dates.tomorrow) return "tomorrow";
  return null;
}

/** The scope and date a new todo of this type gets. */
export function todoTarget(type: Exclude<ItemType, "goal">, dates: BoardDates): { scope: TodoScope; date: string } {
  if (type === "week") return { scope: "WEEK", date: dates.weekStart };
  return { scope: "DAY", date: type === "today" ? dates.today : dates.tomorrow };
}

const nextPosition = (items: Item[]) => items.reduce((m, i) => Math.max(m, i.position), 0) + 1;

let tmpCounter = 0;
export const tmpId = () => `tmp_${Date.now().toString(36)}_${(tmpCounter++).toString(36)}`;
export const isTmp = (id: string) => id.startsWith("tmp_");

export function draftTodo(
  board: Board,
  type: Exclude<ItemType, "goal">,
  fields: { title: string; notes: string | null },
  now: Date,
): Todo {
  const { scope, date } = todoTarget(type, board.dates);
  const stamp = now.toISOString();
  return {
    id: tmpId(),
    title: fields.title,
    notes: fields.notes,
    scope,
    date,
    position: nextPosition(board[type].active),
    completedAt: null,
    completedOn: null,
    carriedOver: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function draftGoal(
  board: Board,
  fields: { title: string; description: string | null; color: GoalColor },
  now: Date,
): Goal {
  const stamp = now.toISOString();
  return {
    id: tmpId(),
    title: fields.title,
    description: fields.description,
    color: fields.color,
    month: board.dates.month,
    position: nextPosition(board.goals.active),
    completedAt: null,
    completedOn: null,
    carriedOver: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** The column or carousel an item belongs to, as the modal's type. */
export function itemType(board: Board, id: string): ItemType | null {
  const at = locate(board, id);
  return at ? typeOfList(at.list) : null;
}
