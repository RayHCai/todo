import { z } from "zod";
import { GoalSchema } from "./goals";
import { IsoDate } from "./primitives";
import { TodoSchema } from "./todos";

/** Largest allowed `[from, to]` span, counting both ends. Covers any three calendar months. */
export const MAX_HISTORY_DAYS = 93;

const MS_PER_DAY = 86_400_000;

export const HistoryQuery = z.object({ from: IsoDate, to: IsoDate }).superRefine((value, ctx) => {
  const from = Date.parse(`${value.from}T00:00:00.000Z`);
  const to = Date.parse(`${value.to}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return; // already reported by IsoDate
  if (to < from) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "must not be before from" });
    return;
  }
  const days = (to - from) / MS_PER_DAY + 1;
  if (days > MAX_HISTORY_DAYS) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: `range must be at most ${MAX_HISTORY_DAYS} days`,
    });
  }
});
export type HistoryQuery = z.infer<typeof HistoryQuery>;

export const HistoryResponse = z.object({
  from: IsoDate,
  to: IsoDate,
  /** DAY todos dated in range, WEEK todos whose week overlaps it, and anything completed in it. */
  todos: z.array(TodoSchema),
  /** Goals whose month overlaps the range, and any completed in it. */
  goals: z.array(GoalSchema),
});
export type HistoryResponse = z.infer<typeof HistoryResponse>;
