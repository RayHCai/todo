import { z } from "zod";
import { GoalSchema } from "./goals";
import { IsoDate } from "./primitives";
import { TodoSchema } from "./todos";

export const BoardQuery = z.object({
  /** The client's local "today". The server never decides what today is. */
  today: IsoDate,
});
export type BoardQuery = z.infer<typeof BoardQuery>;

export const BoardDatesSchema = z.object({
  today: IsoDate,
  tomorrow: IsoDate,
  /** Sunday that starts the current week. */
  weekStart: IsoDate,
  /** Saturday that ends the current week. */
  weekEnd: IsoDate,
  /** 1st of the current month. */
  month: IsoDate,
});
export type BoardDates = z.infer<typeof BoardDatesSchema>;

const todoList = z.object({ active: z.array(TodoSchema), completed: z.array(TodoSchema) });
const goalList = z.object({ active: z.array(GoalSchema), completed: z.array(GoalSchema) });

export const BoardResponse = z.object({
  dates: BoardDatesSchema,
  goals: goalList,
  today: todoList,
  tomorrow: todoList,
  week: todoList,
});
export type BoardResponse = z.infer<typeof BoardResponse>;
