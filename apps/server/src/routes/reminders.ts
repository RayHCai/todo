import { createHash, timingSafeEqual } from "node:crypto";
import { SendReminderBody, SendReminderResponse } from "@todo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AppError, unauthenticated } from "../lib/errors";
import type { Reminders } from "../reminders/service";

export interface ReminderRouteOptions {
  reminders: Reminders;
  /** Bearer token callers must present; the route uses it instead of a session. */
  secret: string;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Sends (or previews) a reminder on demand, for testing and external schedulers. */
export const reminderRoutes: FastifyPluginAsyncZod<ReminderRouteOptions> = async (app, options) => {
  const { reminders } = options;
  const expected = digest(`Bearer ${options.secret}`);

  // onRequest so a bad token gets 401 before the body is validated, like the session guard.
  app.addHook("onRequest", async (request) => {
    const header = request.headers.authorization ?? "";
    if (!timingSafeEqual(digest(header), expected)) throw unauthenticated();
  });

  app.post(
    "/reminders",
    { schema: { body: SendReminderBody, response: { 200: SendReminderResponse } } },
    async (request) => {
      const { kind, dryRun } = request.body;
      if (dryRun) {
        const email = await reminders.build(kind);
        return { sent: false, count: email.count, subject: email.subject, text: email.text };
      }
      if (!reminders.canSend) throw new AppError(503, "INTERNAL", "Email reminders are not configured");
      const { sent, email } = await reminders.send(kind);
      return { sent, count: email.count, subject: email.subject, text: email.text };
    },
  );
};
