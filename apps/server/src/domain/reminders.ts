/**
 * Reminder emails: which items each kind lists, and how the email reads. Pure functions; the
 * reminder service loads the board and sends the result.
 *
 * Unlike the board routes, reminders run with no client to say what "today" is, so the server
 * derives it from a configured time zone with `localDate`.
 */
import type { BoardDates, ReminderKind } from "@todo/shared";
import { addDays, toDbDate, type IsoDate } from "./dates";

export interface ReminderItem {
  title: string;
  carriedOver: boolean;
}

export interface ReminderLists {
  dates: BoardDates;
  today: { active: ReminderItem[] };
  week: { active: ReminderItem[] };
  goals: { active: ReminderItem[] };
}

export interface ReminderEmail {
  count: number;
  subject: string;
  text: string;
  html: string;
}

/** The calendar date at `now` in `timeZone`, as `YYYY-MM-DD`. */
export function localDate(now: Date, timeZone: string): IsoDate {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** True when `date` is a Monday and the next Monday falls in a later month. */
export function isLastMondayOfMonth(date: IsoDate): boolean {
  return toDbDate(date).getUTCDay() === 1 && addDays(date, 7).slice(0, 7) !== date.slice(0, 7);
}

function formatDate(date: IsoDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(toDbDate(date));
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function composeReminder(kind: ReminderKind, board: ReminderLists): ReminderEmail {
  const { dates } = board;
  const { items, noun, heading, subject } = (() => {
    switch (kind) {
      case "daily": {
        const day = formatDate(dates.today, { weekday: "short", month: "short", day: "numeric" });
        return { items: board.today.active, noun: "task", heading: "Today", subject: `Today, ${day}` };
      }
      case "weekly": {
        const start = formatDate(dates.weekStart, { month: "short", day: "numeric" });
        const end = formatDate(dates.weekEnd, { month: "short", day: "numeric" });
        return {
          items: board.week.active,
          noun: "task",
          heading: "This week",
          subject: `This week, ${start} – ${end}`,
        };
      }
      case "monthly": {
        const month = formatDate(dates.month, { month: "long", year: "numeric" });
        return { items: board.goals.active, noun: "goal", heading: "Goals", subject: `Goals, ${month}` };
      }
    }
  })();

  const count = items.length;
  const summary = count === 0 ? `No open ${noun}s.` : `${plural(count, noun)} still open:`;
  const label = (item: ReminderItem) => (item.carriedOver ? `${item.title} (carried over)` : item.title);

  const text = [summary, "", ...items.map((item) => `- ${label(item)}`)].join("\n").trimEnd();

  const listHtml = items
    .map((item) => {
      const carried = item.carriedOver ? ' <span style="color:#9b9a97">· carried over</span>' : "";
      return `<li style="margin:0 0 8px">${escapeHtml(item.title)}${carried}</li>`;
    })
    .join("");
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#37352f;font-size:15px;line-height:1.5;max-width:480px">
<h2 style="font-size:20px;font-weight:600;margin:0 0 4px">${heading}</h2>
<p style="color:#787774;margin:0 0 16px">${escapeHtml(summary)}</p>
${count > 0 ? `<ul style="padding-left:20px;margin:0">${listHtml}</ul>` : ""}
</div>`;

  return { count, subject: `${subject} · ${count} open`, text, html };
}
