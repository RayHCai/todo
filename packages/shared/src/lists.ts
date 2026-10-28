import { z } from "zod";
import { GoalColor } from "./goals";
import { IsoDate, Position, Timestamp, Title, checkCompletion, completionFields } from "./primitives";

export const ListName = z.string().trim().min(1, "is required").max(60, "must be at most 60 characters");

/** A named list of tasks (Home, Work, …), drawn in one of the goal palette colors. */
export const ListSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: GoalColor,
  position: z.number(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type List = z.infer<typeof ListSchema>;

/** A task on a list. Unlike board todos it may have no date ("someday") and never carries over. */
export const ListTaskSchema = z.object({
  id: z.string(),
  listId: z.string(),
  title: z.string(),
  /** Optional due date. */
  date: IsoDate.nullable(),
  position: z.number(),
  completedAt: Timestamp.nullable(),
  completedOn: IsoDate.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type ListTask = z.infer<typeof ListTaskSchema>;

/** Every list and every task, active and completed. */
export const ListsResponse = z.object({
  lists: z.array(ListSchema),
  tasks: z.array(ListTaskSchema),
});
export type ListsResponse = z.infer<typeof ListsResponse>;

export const CreateListBody = z.object({
  name: ListName,
  color: GoalColor,
  position: Position.optional(),
});
export type CreateListBody = z.infer<typeof CreateListBody>;

export const UpdateListBody = z.object({
  name: ListName.optional(),
  color: GoalColor.optional(),
});
export type UpdateListBody = z.infer<typeof UpdateListBody>;

/** `position` and the completion fields let "undo delete" re-create a task in one request. */
export const CreateListTaskBody = z
  .object({
    listId: z.string().min(1).max(64),
    title: Title,
    date: IsoDate.nullable().optional(),
    position: Position.optional(),
    ...completionFields,
  })
  .superRefine(checkCompletion);
export type CreateListTaskBody = z.infer<typeof CreateListTaskBody>;

/** `date: null` clears the date. */
export const UpdateListTaskBody = z
  .object({
    title: Title.optional(),
    date: IsoDate.nullable().optional(),
    ...completionFields,
  })
  .superRefine(checkCompletion);
export type UpdateListTaskBody = z.infer<typeof UpdateListTaskBody>;
