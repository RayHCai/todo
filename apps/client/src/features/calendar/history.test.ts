import { describe, expect, it } from "vitest";
import { goal, todo } from "../../test/fixtures";
import { indexHistory } from "./history";

const page = (todos = [] as ReturnType<typeof todo>[], goals = [] as ReturnType<typeof goal>[]) => ({
  from: "2026-10-01",
  to: "2026-10-31",
  todos,
  goals,
});
const at = "2026-10-05T10:00:00.000Z";

describe("indexHistory", () => {
  const index = indexHistory(
    [
      page(
        [
          todo({ id: "on-time", title: "On time", date: "2026-10-03", completedAt: at, completedOn: "2026-10-03" }),
          todo({ id: "late", title: "Late", date: "2026-10-02", completedAt: at, completedOn: "2026-10-05" }),
          todo({ id: "missed", title: "Missed", date: "2026-10-01" }),
          todo({ id: "open", title: "Open", date: "2026-10-08" }),
          todo({ id: "early", title: "Early", date: "2026-10-09", completedAt: at, completedOn: "2026-10-05" }),
          todo({ id: "wk", title: "Week", scope: "WEEK", date: "2026-10-04" }),
        ],
        [goal({ id: "g", title: "Goal", month: "2026-09-01", completedAt: at, completedOn: "2026-10-05" })],
      ),
      // The same rows can come back in a neighbouring month's page.
      page([todo({ id: "missed", title: "Missed", date: "2026-10-01" })]),
    ],
    "2026-10-06",
  );

  it("counts a todo done on its day as completed and on time", () => {
    expect(index.days.get("2026-10-03")).toMatchObject({ scheduled: 1, doneOnTime: 1 });
    expect(index.days.get("2026-10-03")?.completed.map((t) => t.id)).toEqual(["on-time"]);
  });

  it("shows a late todo as carried over on its day and completed on the day it was done", () => {
    expect(index.days.get("2026-10-02")?.missed.map((t) => t.id)).toEqual(["late"]);
    expect(index.days.get("2026-10-05")?.completed.map((t) => t.id)).toContain("late");
  });

  it("marks past unfinished todos missed and future ones open, once each", () => {
    expect(index.days.get("2026-10-01")?.missed.map((t) => t.id)).toEqual(["missed"]);
    expect(index.days.get("2026-10-08")?.open.map((t) => t.id)).toEqual(["open"]);
  });

  it("keeps an early finish on its scheduled day", () => {
    expect(index.days.get("2026-10-09")?.completed.map((t) => t.id)).toEqual(["early"]);
    expect(index.days.get("2026-10-05")?.completions).toBe(2);
  });

  it("groups week todos and goals", () => {
    expect(index.weeks.get("2026-10-04")?.open.map((t) => t.id)).toEqual(["wk"]);
    expect(index.months.get("2026-10")?.map((g) => g.id)).toEqual(["g"]);
  });
});
