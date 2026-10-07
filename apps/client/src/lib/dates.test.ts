import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  dayLabel,
  localToday,
  monthRange,
  monthStartIso,
  monthTitle,
  msUntilNextMidnight,
  shiftMonth,
  weekRangeLabel,
  weekStartIso,
  weeksCovering,
} from "./dates";

describe("dates", () => {
  it("formats the local day", () => {
    expect(localToday(new Date(2026, 9, 6, 23, 59))).toBe("2026-10-06");
    expect(dayLabel("2026-10-06")).toBe("Tue, Oct 6");
    expect(monthTitle("2026-10-01")).toBe("October 2026");
  });

  it("labels a week inside one month", () => {
    expect(weekRangeLabel("2026-10-04")).toBe("Oct 4 – Oct 10");
  });

  it("labels a week that crosses into the next month", () => {
    expect(weekRangeLabel(weekStartIso("2026-10-01"))).toBe("Sep 27 – Oct 3");
  });

  it("starts weeks on Sunday", () => {
    expect(weekStartIso("2026-10-06")).toBe("2026-10-04");
    expect(weekStartIso("2026-10-04")).toBe("2026-10-04");
    expect(weekStartIso("2026-10-10")).toBe("2026-10-04");
  });

  it("puts a Saturday's tomorrow in the next week", () => {
    const saturday = "2026-10-10";
    const tomorrow = addDaysIso(saturday, 1);
    expect(tomorrow).toBe("2026-10-11");
    expect(weekStartIso(tomorrow)).not.toBe(weekStartIso(saturday));
  });

  it("rolls December into January", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(monthStartIso("2027-01-01")).toBe("2027-01-01");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(weekRangeLabel(weekStartIso("2026-12-31"))).toBe("Dec 27 – Jan 2");
  });

  it("handles leap-year months", () => {
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("covers every week touching the months", () => {
    const weeks = weeksCovering("2026-10", "2026-10");
    expect(weeks[0]).toBe("2026-09-27");
    expect(weeks[weeks.length - 1]).toBe("2026-10-25");
    expect(weeks).toHaveLength(5);
  });

  it("schedules the rollover just after local midnight", () => {
    const ms = msUntilNextMidnight(new Date(2026, 9, 6, 23, 59, 0));
    expect(ms).toBeGreaterThanOrEqual(60_000);
    expect(ms).toBeLessThan(61_000);
  });
});
