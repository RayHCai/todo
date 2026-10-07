import { describe, expect, it } from "vitest";
import { board } from "../test/fixtures";
import {
  draftGoal,
  draftTodo,
  isTmp,
  listForTodo,
  locate,
  todoTarget,
  withActive,
  withCompletion,
  withoutItem,
} from "./board";

const now = new Date("2026-10-06T15:00:00.000Z");

describe("board cache", () => {
  it("moves a completed todo to the front of its own list's completed section", () => {
    const next = withCompletion(board(), "t1", true, "2026-10-06", now);
    expect(next.today.active.map((t) => t.id)).toEqual(["t2"]);
    expect(next.today.completed.map((t) => t.id)).toEqual(["t1", "t3"]);
    expect(next.today.completed[0]).toMatchObject({ completedOn: "2026-10-06", completedAt: now.toISOString() });
  });

  it("returns an unchecked todo to its active position", () => {
    const done = withCompletion(board(), "t1", true, "2026-10-06", now);
    const back = withCompletion(done, "t1", false, "2026-10-06", now);
    expect(back.today.active.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(back.today.active[0]).toMatchObject({ completedAt: null, completedOn: null });
  });

  it("moves goals into the achieved list", () => {
    const next = withCompletion(board(), "g1", true, "2026-10-06", now);
    expect(next.goals.active).toHaveLength(0);
    expect(next.goals.completed.map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("leaves the board untouched for unknown ids or no-op toggles", () => {
    const b = board();
    expect(withCompletion(b, "nope", true, "2026-10-06", now)).toBe(b);
    expect(withCompletion(b, "t3", true, "2026-10-06", now)).toBe(b);
  });

  it("removes and re-adds items", () => {
    const b = withoutItem(board(), "t4");
    expect(locate(b, "t4")).toBeNull();
    const draft = draftTodo(b, "tomorrow", { title: "Dentist", notes: null }, now);
    const added = withActive(b, "tomorrow", draft);
    expect(added.tomorrow.active[0]?.title).toBe("Dentist");
    expect(isTmp(draft.id)).toBe(true);
  });

  it("puts new items at the bottom of their list", () => {
    const draft = draftTodo(board(), "today", { title: "New", notes: "x" }, now);
    expect(draft).toMatchObject({ scope: "DAY", date: "2026-10-06", position: 3, notes: "x" });
    const g = draftGoal(board(), { title: "Read", description: null, color: "sky" }, now);
    expect(g).toMatchObject({ month: "2026-10-01", position: 2, color: "sky" });
  });

  it("maps types to scope and date", () => {
    const { dates } = board();
    expect(todoTarget("today", dates)).toEqual({ scope: "DAY", date: "2026-10-06" });
    expect(todoTarget("tomorrow", dates)).toEqual({ scope: "DAY", date: "2026-10-07" });
    expect(todoTarget("week", dates)).toEqual({ scope: "WEEK", date: "2026-10-04" });
  });

  it("knows which column a todo falls in", () => {
    const { dates } = board();
    expect(listForTodo(dates, "DAY", "2026-10-01")).toBe("today");
    expect(listForTodo(dates, "DAY", "2026-10-07")).toBe("tomorrow");
    expect(listForTodo(dates, "DAY", "2026-10-09")).toBeNull();
    expect(listForTodo(dates, "WEEK", "2026-09-27")).toBe("week");
    expect(listForTodo(dates, "WEEK", "2026-10-11")).toBeNull();
  });
});
