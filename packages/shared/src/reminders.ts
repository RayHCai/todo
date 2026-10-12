import { z } from "zod";

/** daily: today's active todos. weekly: this week's active todos. monthly: active goals. */
export const ReminderKind = z.enum(["daily", "weekly", "monthly"]);
export type ReminderKind = z.infer<typeof ReminderKind>;

export const SendReminderBody = z.object({
  kind: ReminderKind,
  /** Build the email and return it without sending. */
  dryRun: z.boolean().default(false),
});
export type SendReminderBody = z.infer<typeof SendReminderBody>;

export const SendReminderResponse = z.object({
  /** False when nothing is active (no email is sent for an empty list) or on a dry run. */
  sent: z.boolean(),
  count: z.number().int(),
  subject: z.string(),
  text: z.string(),
});
export type SendReminderResponse = z.infer<typeof SendReminderResponse>;
