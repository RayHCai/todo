import { describe, expect, it } from "vitest";
import {
  addDays,
  boardDates,
  daysBetween,
  endOfWeek,
  fromDbDate,
  maxDate,
  normalizeTodoDate,
  startOfMonth,
  startOfWeek,
  toDbDate,
} from "../../src/domain/dates";

describe("addDays", () => {
  it("moves within a month", () => {
    expect(addDays("2026-10-06", 1)).toBe("2026-10-07");
    expect(addDays("2026-10-06", -6)).toBe("2026-09-30");
  });

  it("crosses Dec → Jan in both directions", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01"); // common year
    expect(addDays("2100-02-28", 1)).toBe("2100-03-01"); // divisible by 100, not a leap year
    expect(addDays("2000-02-28", 1)).toBe("2000-02-29"); // divisible by 400, a leap year
  });

  it("is unaffected by DST transitions (calendar days, not instants)", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("rejects invalid dates", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
    expect(() => addDays("2026-13-01", 1)).toThrow(RangeError);
    expect(() => addDays("not-a-date", 1)).toThrow(RangeError);
  });
});

describe("daysBetween", () => {
  it("counts whole days, signed", () => {
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-10-31", "2026-10-01")).toBe(-30);
    expect(daysBetween("2028-02-01", "2028-03-01")).toBe(29);
  });
});

describe("week boundaries (Sunday–Saturday)", () => {
  it("a Sunday starts its own week", () => {
    expect(startOfWeek("2026-10-04")).toBe("2026-10-04");
    expect(endOfWeek("2026-10-04")).toBe("2026-10-10");
  });

  it("a Saturday belongs to the week that started the previous Sunday", () => {
    expect(startOfWeek("2026-10-10")).toBe("2026-10-04");
    expect(endOfWeek("2026-10-10")).toBe("2026-10-10");
  });

  it("midweek days map to the preceding Sunday", () => {
    expect(startOfWeek("2026-10-06")).toBe("2026-10-04");
    expect(startOfWeek("2026-10-08")).toBe("2026-10-04");
  });

  it("weeks spanning a month boundary", () => {
    expect(startOfWeek("2026-10-01")).toBe("2026-09-27");
    expect(endOfWeek("2026-09-28")).toBe("2026-10-03");
  });

  it("weeks spanning a year boundary", () => {
    expect(startOfWeek("2027-01-01")).toBe("2026-12-27");
    expect(endOfWeek("2026-12-30")).toBe("2027-01-02");
  });

  it("weeks spanning Feb 29", () => {
    expect(startOfWeek("2028-03-01")).toBe("2028-02-27");
    expect(endOfWeek("2028-02-27")).toBe("2028-03-04");
  });
});

describe("startOfMonth", () => {
  it("returns the 1st", () => {
    expect(startOfMonth("2026-10-06")).toBe("2026-10-01");
    expect(startOfMonth("2026-10-01")).toBe("2026-10-01");
    expect(startOfMonth("2028-02-29")).toBe("2028-02-01");
    expect(startOfMonth("2026-12-31")).toBe("2026-12-01");
  });
});

describe("normalizeTodoDate", () => {
  it("snaps WEEK todos to Sunday and leaves DAY todos alone", () => {
    expect(normalizeTodoDate("WEEK", "2026-10-08")).toBe("2026-10-04");
    expect(normalizeTodoDate("WEEK", "2026-10-04")).toBe("2026-10-04");
    expect(normalizeTodoDate("DAY", "2026-10-08")).toBe("2026-10-08");
  });
});

describe("maxDate", () => {
  it("returns the later date", () => {
    expect(maxDate("2026-10-06", "2026-10-07")).toBe("2026-10-07");
    expect(maxDate("2026-12-31", "2026-02-01")).toBe("2026-12-31");
  });
});

describe("boardDates", () => {
  it("derives every window from today", () => {
    expect(boardDates("2026-10-06")).toEqual({
      today: "2026-10-06",
      tomorrow: "2026-10-07",
      weekStart: "2026-10-04",
      weekEnd: "2026-10-10",
      month: "2026-10-01",
    });
  });

  it("on a Saturday, tomorrow falls in the next week", () => {
    const dates = boardDates("2026-10-10");
    expect(dates.tomorrow).toBe("2026-10-11");
    expect(dates.weekStart).toBe("2026-10-04");
    expect(dates.weekEnd).toBe("2026-10-10");
    expect(startOfWeek(dates.tomorrow)).toBe("2026-10-11");
  });

  it("on Dec 31, tomorrow is in the next year and month", () => {
    expect(boardDates("2026-12-31")).toEqual({
      today: "2026-12-31",
      tomorrow: "2027-01-01",
      weekStart: "2026-12-27",
      weekEnd: "2027-01-02",
      month: "2026-12-01",
    });
  });

  it("on Feb 28 of a leap year, tomorrow is Feb 29", () => {
    expect(boardDates("2028-02-28").tomorrow).toBe("2028-02-29");
    expect(boardDates("2028-02-29").tomorrow).toBe("2028-03-01");
  });

  it("rejects invalid dates", () => {
    expect(() => boardDates("2026-02-29")).toThrow(RangeError);
  });
});

describe("DB date conversion", () => {
  it("round-trips through UTC midnight", () => {
    const date = toDbDate("2026-10-06");
    expect(date.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(fromDbDate(date)).toBe("2026-10-06");
  });
});
