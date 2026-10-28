import type { List, ListTask } from "@todo/shared";
import { describe, expect, it } from "vitest";
import { dueLabel, isLate, nextColor, quickDates, replaceList, sectionsOf, withoutList, type Lists } from "./lists";

const stamp = "2026-10-01T09:00:00.000Z";

const task = (over: Partial<ListTask> & { id: string }): ListTask => ({
  listId: "home",
  title: over.id,
  date: null,
  position: 1,
  completedAt: null,
  completedOn: null,
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
});

const list = (over: Partial<List> & { id: string }): List => ({
  name: over.id,
  color: "teal",
  position: 1,
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
});

describe("sectionsOf", () => {
  it("splits dated, undated and done tasks, each in its own order", () => {
    const { scheduled, someday, done } = sectionsOf([
      task({ id: "late", date: "2026-11-02" }),
      task({ id: "soon", date: "2026-10-29" }),
      task({ id: "b", position: 2 }),
      task({ id: "a", position: 1 }),
      task({ id: "old", completedAt: "2026-10-01T10:00:00.000Z", completedOn: "2026-10-01" }),
      task({ id: "new", completedAt: "2026-10-20T10:00:00.000Z", completedOn: "2026-10-20", date: "2026-10-30" }),
    ]);
    expect(scheduled.map((t) => t.id)).toEqual(["soon", "late"]);
    expect(someday.map((t) => t.id)).toEqual(["a", "b"]);
    expect(done.map((t) => t.id)).toEqual(["new", "old"]);
  });
});

describe("dates", () => {
  const today = "2026-10-28"; // a Wednesday

  it("labels due dates relative to today", () => {
    expect(dueLabel("2026-10-28", today)).toBe("Today");
    expect(dueLabel("2026-10-29", today)).toBe("Tomorrow");
    expect(dueLabel("2026-10-27", today)).toBe("Yesterday");
    expect(dueLabel("2026-10-31", today)).toBe("Sat");
    expect(dueLabel("2026-11-04", today)).toBe("Nov 4");
    expect(dueLabel("2026-10-20", today)).toBe("Oct 20");
  });

  it("only flags open tasks dated before today as late", () => {
    expect(isLate(task({ id: "x", date: "2026-10-27" }), today)).toBe(true);
    expect(isLate(task({ id: "x", date: "2026-10-28" }), today)).toBe(false);
    expect(isLate(task({ id: "x" }), today)).toBe(false);
    expect(isLate(task({ id: "x", date: "2026-10-27", completedAt: stamp, completedOn: "2026-10-27" }), today)).toBe(
      false,
    );
  });

  it("offers today, tomorrow, the coming weekend and a week out", () => {
    expect(quickDates(today).map((q) => q.date)).toEqual(["2026-10-28", "2026-10-29", "2026-10-31", "2026-11-04"]);
    // On a weekend, "This weekend" is today.
    expect(quickDates("2026-11-01")[2]?.date).toBe("2026-11-01");
    expect(quickDates("2026-10-31")[2]?.date).toBe("2026-10-31");
  });
});

describe("cache edits", () => {
  it("gives a new list the first unused color", () => {
    expect(nextColor([])).toBe("amber");
    expect(nextColor(["amber", "coral"])).toBe("rose");
  });

  it("re-points tasks added to a draft list once the server copy arrives", () => {
    const data: Lists = { lists: [list({ id: "tmp_1" })], tasks: [task({ id: "t", listId: "tmp_1" })] };
    const next = replaceList(data, "tmp_1", list({ id: "srv_1" }));
    expect(next.lists.map((l) => l.id)).toEqual(["srv_1"]);
    expect(next.tasks[0]?.listId).toBe("srv_1");
  });

  it("drops a deleted list's tasks with it", () => {
    const data: Lists = {
      lists: [list({ id: "home" }), list({ id: "work" })],
      tasks: [task({ id: "a" }), task({ id: "b", listId: "work" })],
    };
    expect(withoutList(data, "home").tasks.map((t) => t.id)).toEqual(["b"]);
  });
});
