import { z } from "zod";
import { IsoDate, LongText, Position, Timestamp, Title, checkCompletion, completionFields } from "./primitives";

export const TodoScope = z.enum(["DAY", "WEEK"]);
export type TodoScope = z.infer<typeof TodoScope>;

export const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  scope: TodoScope,
  /** DAY: the day. WEEK: the Sunday that starts the week. */
  date: IsoDate,
  position: z.number(),
  completedAt: Timestamp.nullable(),
  completedOn: IsoDate.nullable(),
  /** Derived: active and scheduled before the current window. */
  carriedOver: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Todo = z.infer<typeof TodoSchema>;

/**
 * `position` and the completion fields are optional extras so that "undo delete" can re-create
 * an item from its cached copy in one request.
 */
export const CreateTodoBody = z
  .object({
    title: Title,
    notes: LongText.optional(),
    scope: TodoScope,
    date: IsoDate,
    position: Position.optional(),
    ...completionFields,
  })
  .superRefine(checkCompletion);
export type CreateTodoBody = z.infer<typeof CreateTodoBody>;

export const UpdateTodoBody = z
  .object({
    title: Title.optional(),
    notes: LongText.optional(),
    date: IsoDate.optional(),
    scope: TodoScope.optional(),
    position: Position.optional(),
    ...completionFields,
  })
  .superRefine(checkCompletion);
export type UpdateTodoBody = z.infer<typeof UpdateTodoBody>;
