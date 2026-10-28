import type { Goal as GoalRow, List as ListRow, Todo as TodoRow } from "@prisma/client";
import type { Goal, GoalColor, List, ListTask, Todo } from "@todo/shared";
import { fromDbDate } from "../domain/dates";

/**
 * Row → API shape. `carriedOver` starts false; the board sets it from placement rules.
 * Only dated todos have a board shape; queries that feed this filter out undated list tasks.
 */
export function toTodoDto(row: TodoRow): Todo {
  if (!row.date) throw new Error(`Todo ${row.id} has no date`);
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    scope: row.scope,
    date: fromDbDate(row.date),
    listId: row.listId,
    position: row.position,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedOn: row.completedOn ? fromDbDate(row.completedOn) : null,
    carriedOver: false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toGoalDto(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    color: row.color as GoalColor,
    month: fromDbDate(row.month),
    position: row.position,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedOn: row.completedOn ? fromDbDate(row.completedOn) : null,
    carriedOver: false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toListDto(row: ListRow): List {
  return {
    id: row.id,
    name: row.name,
    color: row.color as GoalColor,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A todo filed under a list, as the Lists page sees it. */
export function toListTaskDto(row: TodoRow & { listId: string }): ListTask {
  return {
    id: row.id,
    listId: row.listId,
    title: row.title,
    date: row.date ? fromDbDate(row.date) : null,
    position: row.position,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedOn: row.completedOn ? fromDbDate(row.completedOn) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** `""` and whitespace-only text are stored as `null`. */
export function emptyToNull(text: string | null | undefined): string | null {
  return text ? text : null;
}
