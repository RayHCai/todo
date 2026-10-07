import type { HistoryResponse } from "@todo/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "../../src/app";
import { client, createApp, insertGoal, insertTodo, login, resetDb } from "../helpers";

let app: App;
let api: ReturnType<typeof client>;

beforeAll(async () => {
  await resetDb();
  app = await createApp();
  api = client(app, await login(app));

  await Promise.all([
    insertTodo({ title: "day-in", date: "2026-10-15" }),
    insertTodo({ title: "day-first", date: "2026-10-01" }),
    insertTodo({ title: "day-last", date: "2026-10-31" }),
    insertTodo({ title: "day-before", date: "2026-09-30" }),
    insertTodo({ title: "day-after", date: "2026-11-01" }),
    insertTodo({ title: "day-before-done-in", date: "2026-09-20", completedOn: "2026-10-02" }),
    insertTodo({ title: "day-before-done-before", date: "2026-09-20", completedOn: "2026-09-21" }),
    // Week of Sun 09-27 – Sat 10-03 overlaps October.
    insertTodo({ title: "week-overlapping-start", scope: "WEEK", date: "2026-09-27" }),
    insertTodo({ title: "week-before", scope: "WEEK", date: "2026-09-20" }),
    insertTodo({ title: "week-in", scope: "WEEK", date: "2026-10-11" }),
    // Week of Sun 11-01 starts after the range.
    insertTodo({ title: "week-after", scope: "WEEK", date: "2026-11-01" }),
    insertGoal({ title: "goal-oct", month: "2026-10-01" }),
    insertGoal({ title: "goal-sep", month: "2026-09-01" }),
    insertGoal({ title: "goal-sep-done-oct", month: "2026-09-01", completedOn: "2026-10-05" }),
    insertGoal({ title: "goal-nov", month: "2026-11-01" }),
  ]);
});

afterAll(async () => {
  await app.close();
});

const fetchHistory = async (from: string, to: string) => api.get(`/api/history?from=${from}&to=${to}`);

describe("GET /api/history", () => {
  it("returns items scheduled or completed in [from, to]", async () => {
    const res = await fetchHistory("2026-10-01", "2026-10-31");
    expect(res.status).toBe(200);
    const body: HistoryResponse = res.body;
    expect(body.from).toBe("2026-10-01");
    expect(body.to).toBe("2026-10-31");
    expect(body.todos.map((t) => t.title).sort()).toEqual(
      ["day-first", "day-in", "day-last", "day-before-done-in", "week-overlapping-start", "week-in"].sort(),
    );
    expect(body.goals.map((g) => g.title).sort()).toEqual(["goal-oct", "goal-sep-done-oct"].sort());
  });

  it("includes goals whose month overlaps a mid-month range", async () => {
    const res = await fetchHistory("2026-09-15", "2026-09-20");
    expect(res.body.goals.map((g: { title: string }) => g.title).sort()).toEqual(
      ["goal-sep", "goal-sep-done-oct"].sort(),
    );
    expect(res.body.todos.map((t: { title: string }) => t.title).sort()).toEqual(
      ["day-before-done-before", "day-before-done-in", "week-before"].sort(),
    );
  });

  it("allows a range of exactly 93 days", async () => {
    expect((await fetchHistory("2026-08-01", "2026-11-01")).status).toBe(200);
  });

  it("rejects a range longer than 93 days", async () => {
    const res = await fetchHistory("2026-08-01", "2026-11-02");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toContain("93 days");
  });

  it("rejects to before from", async () => {
    const res = await fetchHistory("2026-10-31", "2026-10-01");
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues[0].path).toBe("to");
  });

  it("rejects missing or invalid dates", async () => {
    expect((await api.get("/api/history?from=2026-10-01")).status).toBe(400);
    expect((await fetchHistory("2026-10-01", "2026-10-32")).status).toBe(400);
  });
});
