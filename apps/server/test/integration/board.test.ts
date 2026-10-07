import type { BoardResponse } from "@todo/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "../../src/app";
import { client, createApp, insertGoal, insertTodo, login, resetDb } from "../helpers";

// Tuesday 2026-10-06. Week: Sun 10-04 – Sat 10-10.
const TODAY = "2026-10-06";

let app: App;
let api: ReturnType<typeof client>;
let board: BoardResponse;

const titles = (items: { title: string }[]) => items.map((i) => i.title);

beforeAll(async () => {
  await resetDb();
  app = await createApp();
  api = client(app, await login(app));

  await Promise.all([
    // DAY todos
    insertTodo({ title: "today", date: "2026-10-06", position: 2 }),
    insertTodo({ title: "today-first", date: "2026-10-06", position: 1 }),
    insertTodo({ title: "yesterday-unchecked", date: "2026-10-05", position: 1.5 }),
    insertTodo({ title: "last-week-unchecked", date: "2026-09-29", position: 5 }),
    insertTodo({ title: "tomorrow", date: "2026-10-07" }),
    insertTodo({ title: "day-after-tomorrow", date: "2026-10-08" }),
    insertTodo({ title: "yesterday-done-yesterday", date: "2026-10-05", completedOn: "2026-10-05" }),
    insertTodo({
      title: "monday-done-today",
      date: "2026-10-05",
      completedOn: "2026-10-06",
      completedAt: new Date("2026-10-06T15:00:00Z"),
    }),
    insertTodo({
      title: "today-done-today",
      date: "2026-10-06",
      completedOn: "2026-10-06",
      completedAt: new Date("2026-10-06T09:00:00Z"),
    }),
    insertTodo({ title: "tomorrow-done-early", date: "2026-10-07", completedOn: "2026-10-06" }),
    // WEEK todos
    insertTodo({ title: "this-week", scope: "WEEK", date: "2026-10-04" }),
    insertTodo({ title: "last-week-week", scope: "WEEK", date: "2026-09-27", position: 0.5 }),
    insertTodo({ title: "next-week", scope: "WEEK", date: "2026-10-11" }),
    insertTodo({
      title: "last-week-done-this-week",
      scope: "WEEK",
      date: "2026-09-27",
      completedOn: "2026-10-05",
    }),
    insertTodo({
      title: "last-week-done-last-week",
      scope: "WEEK",
      date: "2026-09-27",
      completedOn: "2026-10-03",
    }),
    // Goals
    insertGoal({ title: "goal-this-month", month: "2026-10-01" }),
    insertGoal({ title: "goal-last-month", month: "2026-09-01", position: 3 }),
    insertGoal({ title: "goal-next-month", month: "2026-11-01" }),
    insertGoal({ title: "goal-done-this-month", month: "2026-10-01", completedOn: "2026-10-02" }),
    insertGoal({ title: "goal-sept-done-oct", month: "2026-09-01", completedOn: "2026-10-01" }),
    insertGoal({ title: "goal-sept-done-sept", month: "2026-09-01", completedOn: "2026-09-30" }),
  ]);

  const res = await api.get(`/api/board?today=${TODAY}`);
  expect(res.status).toBe(200);
  board = res.body;
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/board", () => {
  it("derives every date from today", () => {
    expect(board.dates).toEqual({
      today: "2026-10-06",
      tomorrow: "2026-10-07",
      weekStart: "2026-10-04",
      weekEnd: "2026-10-10",
      month: "2026-10-01",
    });
  });

  it("Today: today's todos plus carried-over ones, by position", () => {
    expect(titles(board.today.active)).toEqual(["today-first", "yesterday-unchecked", "today", "last-week-unchecked"]);
    const carried = Object.fromEntries(board.today.active.map((t) => [t.title, t.carriedOver]));
    expect(carried).toEqual({
      "today-first": false,
      today: false,
      "yesterday-unchecked": true,
      "last-week-unchecked": true,
    });
  });

  it("Today completed: finished today, newest first; original date kept", () => {
    expect(titles(board.today.completed)).toEqual(["monday-done-today", "today-done-today"]);
    expect(board.today.completed[0]!.date).toBe("2026-10-05");
  });

  it("Tomorrow: active and finished-early", () => {
    expect(titles(board.tomorrow.active)).toEqual(["tomorrow"]);
    expect(titles(board.tomorrow.completed)).toEqual(["tomorrow-done-early"]);
  });

  it("This Week: carried over and current, completed this week", () => {
    expect(titles(board.week.active)).toEqual(["last-week-week", "this-week"]);
    expect(board.week.active.map((t) => t.carriedOver)).toEqual([true, false]);
    expect(titles(board.week.completed)).toEqual(["last-week-done-this-week"]);
  });

  it("Goals: carried over and current, completed this month", () => {
    expect(titles(board.goals.active)).toEqual(["goal-this-month", "goal-last-month"]);
    expect(board.goals.active.map((g) => g.carriedOver)).toEqual([false, true]);
    expect(titles(board.goals.completed).sort()).toEqual(["goal-done-this-month", "goal-sept-done-oct"].sort());
  });

  it("leaves out everything outside the current windows", () => {
    const all = [
      ...board.today.active,
      ...board.today.completed,
      ...board.tomorrow.active,
      ...board.tomorrow.completed,
      ...board.week.active,
      ...board.week.completed,
      ...board.goals.active,
      ...board.goals.completed,
    ].map((i) => i.title);
    for (const absent of [
      "day-after-tomorrow",
      "yesterday-done-yesterday",
      "next-week",
      "last-week-done-last-week",
      "goal-next-month",
      "goal-sept-done-sept",
    ]) {
      expect(all).not.toContain(absent);
    }
  });

  it("returns the documented item shape", () => {
    const todo = board.today.completed[0]!;
    expect(Object.keys(todo).sort()).toEqual(
      [
        "carriedOver",
        "completedAt",
        "completedOn",
        "createdAt",
        "date",
        "id",
        "notes",
        "position",
        "scope",
        "title",
        "updatedAt",
      ].sort(),
    );
    expect(todo.completedAt).toBe("2026-10-06T15:00:00.000Z");
    expect(todo.completedOn).toBe("2026-10-06");
  });

  it("rejects a missing or invalid today", async () => {
    for (const url of ["/api/board", "/api/board?today=2026-02-30", "/api/board?today=10/06/2026"]) {
      const res = await api.get(url);
      expect(res.status, url).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});
