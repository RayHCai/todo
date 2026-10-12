import { Cron } from "croner";
import { describe, expect, it } from "vitest";
import { boardDates } from "../../src/domain/dates";
import { composeReminder, isLastMondayOfMonth, localDate, type ReminderLists } from "../../src/domain/reminders";

describe("localDate", () => {
  it("uses the zone's calendar day, not UTC's", () => {
    // 03:00 UTC on Oct 13 is still the evening of Oct 12 in Chicago (CDT, UTC-5).
    expect(localDate(new Date("2026-10-13T03:00:00Z"), "America/Chicago")).toBe("2026-10-12");
    expect(localDate(new Date("2026-10-13T05:00:00Z"), "America/Chicago")).toBe("2026-10-13");
  });
});

describe("isLastMondayOfMonth", () => {
  it("is true only on the final Monday", () => {
    expect(isLastMondayOfMonth("2026-10-26")).toBe(true);
    expect(isLastMondayOfMonth("2026-10-19")).toBe(false);
    expect(isLastMondayOfMonth("2026-08-31")).toBe(true); // Monday on the month's last day
    expect(isLastMondayOfMonth("2026-02-23")).toBe(true);
  });

  it("is false on other weekdays", () => {
    expect(isLastMondayOfMonth("2026-10-27")).toBe(false); // Tuesday
    expect(isLastMondayOfMonth("2026-10-31")).toBe(false); // Saturday
  });
});

describe("schedule time zone", () => {
  const nextRun = (from: string) =>
    new Cron("0 6 * * *", { timezone: "America/Chicago", paused: true }).nextRun(new Date(from))?.toISOString();

  it("fires at 6am local through daylight saving changes", () => {
    expect(nextRun("2026-07-01T00:00:00Z")).toBe("2026-07-01T11:00:00.000Z"); // CDT, UTC-5
    expect(nextRun("2026-12-01T00:00:00Z")).toBe("2026-12-01T12:00:00.000Z"); // CST, UTC-6
  });
});

describe("composeReminder", () => {
  // Monday 2026-10-12. Week: Sun 10-11 – Sat 10-17.
  const lists = (overrides: Partial<ReminderLists> = {}): ReminderLists => ({
    dates: boardDates("2026-10-12"),
    today: { active: [] },
    week: { active: [] },
    goals: { active: [] },
    ...overrides,
  });

  it("lists today's open todos, marking carried-over ones", () => {
    const email = composeReminder(
      "daily",
      lists({
        today: {
          active: [
            { title: "Call dentist", carriedOver: true },
            { title: "Ship <reminders>", carriedOver: false },
          ],
        },
      }),
    );
    expect(email.count).toBe(2);
    expect(email.subject).toBe("Today, Mon, Oct 12 · 2 open");
    expect(email.text).toBe("2 tasks still open:\n\n- Call dentist (carried over)\n- Ship <reminders>");
    expect(email.html).toContain("Ship &#60;reminders&#62;");
  });

  it("uses the week's range and the month's name", () => {
    const one = [{ title: "x", carriedOver: false }];
    expect(composeReminder("weekly", lists({ week: { active: one } })).subject).toBe(
      "This week, Oct 11 – Oct 17 · 1 open",
    );
    expect(composeReminder("monthly", lists({ goals: { active: one } })).text).toBe("1 goal still open:\n\n- x");
    expect(composeReminder("monthly", lists()).subject).toBe("Goals, October 2026 · 0 open");
  });
});
