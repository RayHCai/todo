import { describe, expect, it } from "vitest";
import { boardDates } from "../../src/domain/dates";
import { composeBoard, placeGoal, placeTodo } from "../../src/domain/placement";

// Tuesday. Week: Sun 2026-10-04 – Sat 2026-10-10. Month: October.
const dates = boardDates("2026-10-06");

const day = (date: string, completedOn: string | null = null) => ({
  scope: "DAY" as const,
  date,
  completedOn,
});
const week = (date: string, completedOn: string | null = null) => ({
  scope: "WEEK" as const,
  date,
  completedOn,
});
const goal = (month: string, completedOn: string | null = null) => ({ month, completedOn });

describe("active items", () => {
  describe("Today: DAY todos, not completed, date <= today", () => {
    it("today's todo", () => {
      expect(placeTodo(day("2026-10-06"), dates)).toEqual({
        list: "today",
        section: "active",
        carriedOver: false,
      });
    });

    it("yesterday's unchecked todo carries over", () => {
      expect(placeTodo(day("2026-10-05"), dates)).toEqual({
        list: "today",
        section: "active",
        carriedOver: true,
      });
    });

    it("a todo left undone for days keeps rolling into Today, across week and month", () => {
      expect(placeTodo(day("2026-09-29"), dates)).toEqual({
        list: "today",
        section: "active",
        carriedOver: true,
      });
    });
  });

  describe("Tomorrow: DAY todos, not completed, date = tomorrow", () => {
    it("tomorrow's todo", () => {
      expect(placeTodo(day("2026-10-07"), dates)).toEqual({
        list: "tomorrow",
        section: "active",
        carriedOver: false,
      });
    });

    it("todos after tomorrow are not on the board", () => {
      expect(placeTodo(day("2026-10-08"), dates)).toBeNull();
    });
  });

  describe("This Week: WEEK todos, not completed, date <= weekStart", () => {
    it("this week's todo", () => {
      expect(placeTodo(week("2026-10-04"), dates)).toEqual({
        list: "week",
        section: "active",
        carriedOver: false,
      });
    });

    it("last week's unchecked todo carries over", () => {
      expect(placeTodo(week("2026-09-27"), dates)).toEqual({
        list: "week",
        section: "active",
        carriedOver: true,
      });
    });

    it("next week's todo is not on the board", () => {
      expect(placeTodo(week("2026-10-11"), dates)).toBeNull();
    });
  });

  describe("Goals: not completed, month <= currentMonth", () => {
    it("this month's goal", () => {
      expect(placeGoal(goal("2026-10-01"), dates)).toEqual({
        list: "goals",
        section: "active",
        carriedOver: false,
      });
    });

    it("last month's unchecked goal carries over, even across a year", () => {
      expect(placeGoal(goal("2026-09-01"), dates)).toMatchObject({ carriedOver: true });
      expect(placeGoal(goal("2025-12-01"), dates)).toMatchObject({ carriedOver: true });
    });

    it("next month's goal is not on the board", () => {
      expect(placeGoal(goal("2026-11-01"), dates)).toBeNull();
    });
  });
});

describe("completed items (effective date = max(date, completedOn))", () => {
  describe("Today: effective date = today", () => {
    it("today's todo completed today", () => {
      expect(placeTodo(day("2026-10-06", "2026-10-06"), dates)).toEqual({
        list: "today",
        section: "completed",
        carriedOver: false,
      });
    });

    it("a todo carried over from Monday and finished today goes to Today", () => {
      expect(placeTodo(day("2026-10-05", "2026-10-06"), dates)).toMatchObject({
        list: "today",
        section: "completed",
      });
    });

    it("a todo finished on its own earlier day is gone", () => {
      expect(placeTodo(day("2026-10-05", "2026-10-05"), dates)).toBeNull();
    });

    it("a todo carried over and finished yesterday is gone", () => {
      expect(placeTodo(day("2026-10-01", "2026-10-05"), dates)).toBeNull();
    });
  });

  describe("Tomorrow: effective date = tomorrow", () => {
    it("a todo for tomorrow finished early stays in Tomorrow", () => {
      expect(placeTodo(day("2026-10-07", "2026-10-06"), dates)).toEqual({
        list: "tomorrow",
        section: "completed",
        carriedOver: false,
      });
    });

    it("a todo for the day after tomorrow finished early is not on the board", () => {
      expect(placeTodo(day("2026-10-08", "2026-10-06"), dates)).toBeNull();
    });
  });

  describe("This Week: effective date's week = this week", () => {
    it("this week's todo completed this week", () => {
      expect(placeTodo(week("2026-10-04", "2026-10-06"), dates)).toEqual({
        list: "week",
        section: "completed",
        carriedOver: false,
      });
    });

    it("last week's todo carried over and finished this week", () => {
      expect(placeTodo(week("2026-09-27", "2026-10-05"), dates)).toMatchObject({
        list: "week",
        section: "completed",
      });
    });

    it("last week's todo finished last week is gone", () => {
      expect(placeTodo(week("2026-09-27", "2026-10-03"), dates)).toBeNull();
    });

    it("next week's todo finished early is not on this week's board", () => {
      expect(placeTodo(week("2026-10-11", "2026-10-06"), dates)).toBeNull();
    });
  });

  describe("Goals: effective date's month = this month", () => {
    it("this month's goal completed this month", () => {
      expect(placeGoal(goal("2026-10-01", "2026-10-06"), dates)).toEqual({
        list: "goals",
        section: "completed",
        carriedOver: false,
      });
    });

    it("last month's goal carried over and achieved this month", () => {
      expect(placeGoal(goal("2026-09-01", "2026-10-02"), dates)).toMatchObject({
        section: "completed",
      });
    });

    it("last month's goal achieved last month is gone", () => {
      expect(placeGoal(goal("2026-09-01", "2026-09-30"), dates)).toBeNull();
    });

    it("next month's goal achieved early is not on this month's board", () => {
      expect(placeGoal(goal("2026-11-01", "2026-10-06"), dates)).toBeNull();
    });
  });
});

describe("Saturday edge: tomorrow is in the next week", () => {
  const saturday = boardDates("2026-10-10");

  it("Sunday DAY todos show in Tomorrow", () => {
    expect(placeTodo(day("2026-10-11"), saturday)).toMatchObject({ list: "tomorrow" });
  });

  it("next week's WEEK todo is still not on the board", () => {
    expect(placeTodo(week("2026-10-11"), saturday)).toBeNull();
  });
});

describe("composeBoard", () => {
  const item = (
    id: string,
    fields: { scope?: "DAY" | "WEEK"; date: string; position: number; completedOn?: string; completedAt?: string },
  ) => ({
    id,
    scope: fields.scope ?? ("DAY" as const),
    date: fields.date,
    position: fields.position,
    completedOn: fields.completedOn ?? null,
    completedAt: fields.completedAt ?? null,
    createdAt: "2026-10-01T00:00:00.000Z",
    carriedOver: false,
  });

  it("distributes, flags carry-over, sorts active by position and completed newest first", () => {
    const todos = [
      item("t-today-2", { date: "2026-10-06", position: 2 }),
      item("t-old", { date: "2026-10-03", position: 1.5 }),
      item("t-today-1", { date: "2026-10-06", position: 1 }),
      item("t-tomorrow", { date: "2026-10-07", position: 1 }),
      item("t-done-early", {
        date: "2026-10-06",
        position: 3,
        completedOn: "2026-10-06",
        completedAt: "2026-10-06T08:00:00.000Z",
      }),
      item("t-done-late", {
        date: "2026-10-05",
        position: 1,
        completedOn: "2026-10-06",
        completedAt: "2026-10-06T18:00:00.000Z",
      }),
      item("t-far-future", { date: "2026-10-20", position: 1 }),
      item("w-1", { scope: "WEEK", date: "2026-10-04", position: 1 }),
    ];
    const goals = [
      { ...item("g-1", { date: "", position: 2 }), month: "2026-10-01" },
      { ...item("g-0", { date: "", position: 1 }), month: "2026-08-01" },
    ];

    const board = composeBoard(dates, todos, goals);

    expect(board.today.active.map((t) => [t.id, t.carriedOver])).toEqual([
      ["t-today-1", false],
      ["t-old", true],
      ["t-today-2", false],
    ]);
    expect(board.today.completed.map((t) => t.id)).toEqual(["t-done-late", "t-done-early"]);
    expect(board.tomorrow.active.map((t) => t.id)).toEqual(["t-tomorrow"]);
    expect(board.week.active.map((t) => t.id)).toEqual(["w-1"]);
    expect(board.goals.active.map((g) => [g.id, g.carriedOver])).toEqual([
      ["g-0", true],
      ["g-1", false],
    ]);
  });
});
