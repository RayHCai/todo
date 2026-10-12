import type { ReminderKind } from "@todo/shared";
import { Cron } from "croner";
import type { FastifyBaseLogger } from "fastify";
import { isLastMondayOfMonth, localDate } from "../domain/reminders";
import type { Reminders } from "./service";

/**
 * When each reminder goes out, in the reminders' time zone (so DST is handled by croner).
 * Cron can't say "last Monday of the month", so the monthly job runs every Monday and checks.
 */
const SCHEDULES: { kind: ReminderKind; pattern: string; when?: (today: string) => boolean }[] = [
  { kind: "daily", pattern: "0 6,18 * * *" },
  { kind: "weekly", pattern: "0 6 * * 5" },
  { kind: "monthly", pattern: "0 6 * * 1", when: isLastMondayOfMonth },
];

/** Starts the reminder jobs and returns a function that stops them. */
export function startReminderSchedule(reminders: Reminders, log: FastifyBaseLogger): () => void {
  const jobs = SCHEDULES.map(
    ({ kind, pattern, when }) =>
      new Cron(pattern, { name: `reminder:${kind}`, timezone: reminders.timeZone, protect: true }, async () => {
        const now = new Date();
        if (when && !when(localDate(now, reminders.timeZone))) return;
        try {
          const { sent, email } = await reminders.send(kind, now);
          log.info({ kind, sent, count: email.count }, "reminder run");
        } catch (err) {
          log.error({ err, kind }, "reminder failed");
        }
      }),
  );
  log.info(
    { timeZone: reminders.timeZone, next: jobs.map((job) => job.nextRun()?.toISOString()) },
    "reminders scheduled",
  );
  return () => jobs.forEach((job) => job.stop());
}
