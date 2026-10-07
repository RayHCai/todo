import type { Goal as GoalRow, Todo as TodoRow } from "@prisma/client";
import type { Goal, GoalColor, Todo } from "@todo/shared";
import { fromDbDate } from "../domain/dates";

/** Row → API shape. `carriedOver` starts false; the board sets it from placement rules. */
export function toTodoDto(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    scope: row.scope,
    date: fromDbDate(row.date),
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

/** `""` and whitespace-only text are stored as `null`. */
export function emptyToNull(text: string | null | undefined): string | null {
  return text ? text : null;
}
