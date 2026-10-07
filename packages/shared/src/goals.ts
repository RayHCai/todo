import { z } from "zod";
import { IsoDate, LongText, Position, Timestamp, Title, checkCompletion, completionFields } from "./primitives";

/** Palette tokens for goal accents. The client maps each to light/dark color values. */
export const GOAL_COLORS = ["amber", "coral", "rose", "violet", "indigo", "sky", "teal", "emerald"] as const;
export const GoalColor = z.enum(GOAL_COLORS);
export type GoalColor = z.infer<typeof GoalColor>;

export const GoalSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  color: GoalColor,
  /** Always the 1st of the month (`YYYY-MM-01`). */
  month: IsoDate,
  position: z.number(),
  completedAt: Timestamp.nullable(),
  completedOn: IsoDate.nullable(),
  /** Derived: active and scheduled before the current month. */
  carriedOver: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Goal = z.infer<typeof GoalSchema>;

/** Any day in the month is accepted for `month`; the server normalizes it to the 1st. */
export const CreateGoalBody = z
  .object({
    title: Title,
    description: LongText.optional(),
    color: GoalColor,
    month: IsoDate,
    position: Position.optional(),
    ...completionFields,
  })
  .superRefine(checkCompletion);
export type CreateGoalBody = z.infer<typeof CreateGoalBody>;

export const UpdateGoalBody = z
  .object({
    title: Title.optional(),
    description: LongText.optional(),
    color: GoalColor.optional(),
    month: IsoDate.optional(),
    position: Position.optional(),
    ...completionFields,
  })
  .superRefine(checkCompletion);
export type UpdateGoalBody = z.infer<typeof UpdateGoalBody>;
