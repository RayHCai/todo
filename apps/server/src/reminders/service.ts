import type { PrismaClient } from "@prisma/client";
import type { ReminderKind } from "@todo/shared";
import { composeReminder, localDate, type ReminderEmail } from "../domain/reminders";
import { loadBoard } from "../lib/board";
import type { Mailer } from "./mailer";

export interface ReminderResult {
  sent: boolean;
  email: ReminderEmail;
}

export interface Reminders {
  readonly timeZone: string;
  /** True when a mailer and recipient are configured, so `send` can deliver. */
  readonly canSend: boolean;
  /** The email for `kind` as of `now` in the configured time zone. */
  build(kind: ReminderKind, now?: Date): Promise<ReminderEmail>;
  /** Builds and sends the email. Skips sending when nothing is open. */
  send(kind: ReminderKind, now?: Date): Promise<ReminderResult>;
}

export function createReminders(options: {
  prisma: PrismaClient;
  mailer: Mailer | null;
  to: string | undefined;
  timeZone: string;
}): Reminders {
  const { prisma, mailer, to, timeZone } = options;

  const reminders: Reminders = {
    timeZone,
    canSend: mailer !== null && to !== undefined,

    async build(kind, now = new Date()) {
      const board = await loadBoard(prisma, localDate(now, timeZone));
      return composeReminder(kind, board);
    },

    async send(kind, now) {
      if (!mailer || !to) throw new Error("Email reminders are not configured");
      const email = await reminders.build(kind, now);
      if (email.count === 0) return { sent: false, email };
      await mailer.send({ to, subject: email.subject, text: email.text, html: email.html });
      return { sent: true, email };
    },
  };
  return reminders;
}
