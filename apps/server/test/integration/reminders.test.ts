import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../../src/app";
import { addDays, startOfWeek } from "../../src/domain/dates";
import { localDate } from "../../src/domain/reminders";
import type { Email } from "../../src/reminders/mailer";
import { createApp, insertGoal, insertTodo, resetDb, testEnv } from "../helpers";

const SECRET = "reminder-secret-that-is-at-least-32-chars";
const auth = { authorization: `Bearer ${SECRET}` };

// Reminders read "today" from the clock, so fixtures are relative to it.
const today = localDate(new Date(), "America/Chicago");

let app: App;
let sent: Email[];

beforeAll(async () => {
  await resetDb();
  app = await createApp({
    env: testEnv({ REMINDER_SECRET: SECRET, REMINDER_EMAIL_TO: "me@example.com" }),
    mailer: { send: async (email) => void sent.push(email) },
  });
  await Promise.all([
    insertTodo({ title: "today-open", date: today }),
    insertTodo({ title: "yesterday-open", date: addDays(today, -1) }),
    insertTodo({ title: "today-done", date: today, completedOn: today }),
    insertTodo({ title: "tomorrow-open", date: addDays(today, 1) }),
    insertTodo({ title: "week-open", scope: "WEEK", date: startOfWeek(today) }),
    insertGoal({ title: "goal-open", month: `${today.slice(0, 7)}-01` }),
  ]);
});

beforeEach(() => {
  sent = [];
});

afterAll(async () => {
  await app.close();
});

const post = (payload: object, headers: Record<string, string> = auth) =>
  app.inject({ method: "POST", url: "/api/reminders", headers, payload });

describe("POST /api/reminders", () => {
  it("rejects a missing or wrong secret before validating", async () => {
    expect((await post({}, {})).statusCode).toBe(401);
    expect((await post({ kind: "daily" }, { authorization: "Bearer nope" })).statusCode).toBe(401);
  });

  it("emails today's open todos, including carried-over ones", async () => {
    const res = await post({ kind: "daily" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sent: true, count: 2 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("me@example.com");
    expect(sent[0]!.text).toContain("- today-open");
    expect(sent[0]!.text).toContain("- yesterday-open (carried over)");
    expect(sent[0]!.text).not.toContain("today-done");
    expect(sent[0]!.text).not.toContain("tomorrow-open");
  });

  it("covers the week's todos and the month's goals", async () => {
    expect((await post({ kind: "weekly" })).json()).toMatchObject({
      sent: true,
      count: 1,
      text: "1 task still open:\n\n- week-open",
    });
    expect((await post({ kind: "monthly" })).json()).toMatchObject({
      sent: true,
      count: 1,
      text: "1 goal still open:\n\n- goal-open",
    });
  });

  it("previews without sending on a dry run", async () => {
    const res = await post({ kind: "daily", dryRun: true });
    expect(res.json()).toMatchObject({ sent: false, count: 2 });
    expect(sent).toHaveLength(0);
  });

  it("is not registered without a secret", async () => {
    const plain = await createApp();
    const res = await plain.inject({
      method: "POST",
      url: "/api/reminders",
      headers: auth,
      payload: { kind: "daily" },
    });
    expect(res.statusCode).toBe(404);
    await plain.close();
  });
});
