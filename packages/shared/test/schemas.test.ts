import { describe, expect, it } from "vitest";
import { CreateGoalBody, CreateTodoBody, HistoryQuery, IsoDate, UpdateTodoBody } from "../src/index";

describe("IsoDate", () => {
  it.each(["2026-10-06", "2028-02-29", "2000-02-29"])("accepts %s", (value) => {
    expect(IsoDate.safeParse(value).success).toBe(true);
  });

  it.each(["2026-02-29", "2100-02-29", "2026-13-01", "2026-10-6", "2026-10-06T00:00:00Z", ""])(
    "rejects %j",
    (value) => {
      expect(IsoDate.safeParse(value).success).toBe(false);
    },
  );
});

describe("completion fields", () => {
  it("requires completedOn with completed: true", () => {
    expect(UpdateTodoBody.safeParse({ completed: true }).success).toBe(false);
    expect(UpdateTodoBody.safeParse({ completed: true, completedOn: "2026-10-06" }).success).toBe(true);
  });

  it("forbids completedOn without completed: true", () => {
    expect(UpdateTodoBody.safeParse({ completedOn: "2026-10-06" }).success).toBe(false);
    expect(UpdateTodoBody.safeParse({ completed: false, completedOn: "2026-10-06" }).success).toBe(false);
    expect(UpdateTodoBody.safeParse({ completed: false }).success).toBe(true);
  });
});

describe("create bodies", () => {
  it("trims titles and rejects blank ones", () => {
    const parsed = CreateTodoBody.parse({ title: "  hi  ", scope: "DAY", date: "2026-10-06" });
    expect(parsed.title).toBe("hi");
    expect(CreateTodoBody.safeParse({ title: "   ", scope: "DAY", date: "2026-10-06" }).success).toBe(false);
  });

  it("validates goal colors against the palette", () => {
    const base = { title: "x", month: "2026-10-01" };
    expect(CreateGoalBody.safeParse({ ...base, color: "amber" }).success).toBe(true);
    expect(CreateGoalBody.safeParse({ ...base, color: "#ff0000" }).success).toBe(false);
  });
});

describe("HistoryQuery", () => {
  it("allows up to 93 days inclusive", () => {
    expect(HistoryQuery.safeParse({ from: "2026-08-01", to: "2026-11-01" }).success).toBe(true);
    expect(HistoryQuery.safeParse({ from: "2026-08-01", to: "2026-11-02" }).success).toBe(false);
  });

  it("allows a single day and rejects inverted ranges", () => {
    expect(HistoryQuery.safeParse({ from: "2026-10-06", to: "2026-10-06" }).success).toBe(true);
    expect(HistoryQuery.safeParse({ from: "2026-10-07", to: "2026-10-06" }).success).toBe(false);
  });
});
