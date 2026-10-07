import { z } from "zod";

/** True for a real calendar date written as `YYYY-MM-DD` (rejects `2026-02-30`). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** A calendar day in the user's local time zone, as `YYYY-MM-DD`. Never a timestamp. */
export const IsoDate = z.string().refine(isIsoDate, "must be a valid YYYY-MM-DD date");

/** An ISO-8601 timestamp, used only for audit fields (`createdAt`, `completedAt`, …). */
export const Timestamp = z.iso.datetime();

export const Title = z.string().trim().min(1, "is required").max(200, "must be at most 200 characters");

/** Optional free text (todo notes, goal description). `null` or `""` clears it. */
export const LongText = z.string().trim().max(2000, "must be at most 2000 characters").nullable();

/** Fractional ordering key within a list. */
export const Position = z.number();

export const IdParams = z.object({ id: z.string().min(1).max(64) });
export type IdParams = z.infer<typeof IdParams>;

/**
 * Shared completion fields for PATCH bodies. `completedOn` (the user's local date) must accompany
 * `completed: true` and is not allowed otherwise.
 */
export const completionFields = {
  completed: z.boolean().optional(),
  completedOn: IsoDate.optional(),
};

export function checkCompletion(value: { completed?: boolean; completedOn?: string }, ctx: z.RefinementCtx): void {
  if (value.completed === true && value.completedOn === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["completedOn"],
      message: "is required when completed is true",
    });
  }
  if (value.completed !== true && value.completedOn !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["completedOn"],
      message: "is only allowed together with completed: true",
    });
  }
}
