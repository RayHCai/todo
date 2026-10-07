import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  BoardResponse,
  GoalColor,
  GoalSchema,
  HistoryResponse,
  IsoDate,
  LongText,
  MAX_HISTORY_DAYS,
  Position,
  Title,
  TodoSchema,
  TodoScope,
  type Goal,
  type Todo,
} from "@todo/shared";
import { z } from "zod";
import { ApiError, type ApiClient } from "./api";

const INSTRUCTIONS = `\
Tools for a single person's todo list and monthly goals.

Item kinds:
- DAY todo: belongs to one calendar day.
- WEEK todo: belongs to a week (Sunday to Saturday). Its date is stored as that week's Sunday.
- Goal: an objective for a calendar month, with an accent color. Its month is stored as the 1st.

Dates are calendar days in the user's local time zone, written YYYY-MM-DD. Never send timestamps.

Unfinished items roll forward: an unchecked todo from an earlier day shows up in Today, one from an \
earlier week in This Week, and an earlier month's goal in this month. These come back with \
carriedOver: true and keep their original date.

Typical flow: call get_board to see current items and their ids, then create, update or delete. \
Use get_history for anything outside today, tomorrow, this week and this month. Prefer marking \
items completed over deleting them: deletes are permanent and remove the item from history too.`;

/** The local date of the machine running this server, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Field descriptions shared between todo and goal tools.
const id = (kind: string) =>
  z.string().min(1).max(64).describe(`The ${kind}'s id, as returned by get_board, get_history or create_${kind}.`);

const completed = z
  .boolean()
  .optional()
  .describe("true checks the item off. false un-checks it and clears its completion date.");

const completedOn = IsoDate.optional().describe(
  "The local date the item was completed (YYYY-MM-DD). Only allowed with completed: true. " +
    "Defaults to today, so pass it only when back-dating a completion.",
);

const position = Position.optional().describe(
  "Sort key within the item's list; lower values come first. To place an item between two " +
    "others, pass a number between their positions (e.g. 1.5 between 1 and 2).",
);

const todoDate = (verb: string) =>
  IsoDate.describe(
    `The date ${verb}, YYYY-MM-DD. For DAY todos it is the day itself. For WEEK todos any day in ` +
      "the week works; the server stores the Sunday that starts that week.",
  );

const goalMonth = (verb: string) =>
  IsoDate.describe(`Any date in the month ${verb}, YYYY-MM-DD (e.g. 2026-10-15). The server stores the 1st.`);

function json(data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function message(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/** Turns backend failures into tool errors the agent can read and recover from. */
async function call(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    const hint = err.code === "NOT_FOUND" ? ". Call get_board or get_history to look up current ids." : "";
    return { isError: true, content: [{ type: "text", text: `${err.code}: ${err.message}${hint}` }] };
  }
}

/** Fills in `completedOn` with today when an item is checked off without one. */
function withCompletionDate<T extends { completed?: boolean; completedOn?: string }>(body: T): T {
  return body.completed === true && body.completedOn === undefined ? { ...body, completedOn: localToday() } : body;
}

export function createServer(api: ApiClient): McpServer {
  const server = new McpServer({ name: "todo", version: "0.0.0" }, { instructions: INSTRUCTIONS });

  // ---------------------------------------------------------------- read

  server.registerTool(
    "get_board",
    {
      title: "Get board",
      description:
        "Show what's on the user's plate right now: this month's goals and the todos for Today, " +
        "Tomorrow and This Week, each split into active and completed lists. Active lists include " +
        "unfinished items carried over from earlier days, weeks or months (carriedOver: true). " +
        "Use this first to find item ids. It does not show todos planned after tomorrow or after " +
        "this week; use get_history for those.",
      inputSchema: {
        today: IsoDate.optional().describe(
          "The user's local date, YYYY-MM-DD. Tomorrow, the week and the month are worked out " +
            "from it. Defaults to today on the machine running this tool.",
        ),
      },
      outputSchema: BoardResponse,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ today }) =>
      call(async () => {
        const query = new URLSearchParams({ today: today ?? localToday() });
        return json(await api.request<BoardResponse>("GET", `/board?${query}`));
      }),
  );

  server.registerTool(
    "get_history",
    {
      title: "Get history",
      description:
        "List every todo and goal that was scheduled for, or completed within, a date range " +
        `(both ends inclusive, at most ${MAX_HISTORY_DAYS} days). This includes DAY todos dated in ` +
        "the range, WEEK todos whose week overlaps it, goals whose month overlaps it, and anything " +
        "completed in it. Use it to review past work or to find items planned further ahead than " +
        "the board shows. Results are flat lists sorted by date and position, not grouped.",
      inputSchema: {
        from: IsoDate.describe("First day of the range, YYYY-MM-DD."),
        to: IsoDate.describe(
          `Last day of the range, YYYY-MM-DD. Must not be before from, and the range may span at most ${MAX_HISTORY_DAYS} days.`,
        ),
      },
      outputSchema: HistoryResponse,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ from, to }) =>
      call(async () => {
        const query = new URLSearchParams({ from, to });
        return json(await api.request<HistoryResponse>("GET", `/history?${query}`));
      }),
  );

  // ---------------------------------------------------------------- todos

  server.registerTool(
    "create_todo",
    {
      title: "Create todo",
      description:
        "Add a todo for a specific day (scope DAY) or for a whole week (scope WEEK). It goes to " +
        "the bottom of its list. Returns the created todo with its id. Pass completed: true to log " +
        "something that is already done.",
      inputSchema: {
        title: Title.describe("Short text of the todo, 1 to 200 characters."),
        scope: TodoScope.describe("DAY for a task due on one day; WEEK for a task to get done sometime that week."),
        date: todoDate("the todo is planned for"),
        notes: LongText.optional().describe("Optional longer details, up to 2000 characters."),
        completed,
        completedOn,
      },
      outputSchema: TodoSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => call(async () => json(await api.request<Todo>("POST", "/todos", withCompletionDate(args)))),
  );

  server.registerTool(
    "update_todo",
    {
      title: "Update todo",
      description:
        "Change an existing todo; only the fields you pass are changed. Use it to rename it, edit " +
        "its notes, check it off or un-check it, reschedule it (change date, e.g. to tomorrow, " +
        "and/or scope, e.g. DAY to WEEK), or reorder it within its list (position). A rescheduled " +
        "todo goes to the bottom of its new list unless you also pass position. Returns the " +
        "updated todo.",
      inputSchema: {
        id: id("todo"),
        title: Title.optional().describe("New text, 1 to 200 characters."),
        notes: LongText.optional().describe(
          "New notes, up to 2000 characters. Pass null or an empty string to remove them.",
        ),
        scope: TodoScope.optional().describe(
          "Switch between DAY (one day) and WEEK (the whole week). The date is re-normalized for the new scope.",
        ),
        date: todoDate("to move the todo to").optional(),
        position,
        completed,
        completedOn,
      },
      outputSchema: TodoSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ id, ...body }) =>
      call(async () =>
        json(await api.request<Todo>("PATCH", `/todos/${encodeURIComponent(id)}`, withCompletionDate(body))),
      ),
  );

  server.registerTool(
    "delete_todo",
    {
      title: "Delete todo",
      description:
        "Permanently delete a todo. It is removed from the board and from history, and this " +
        "cannot be undone. To record that a todo is done, use update_todo with completed: true instead.",
      inputSchema: { id: id("todo") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ id }) =>
      call(async () => {
        await api.request("DELETE", `/todos/${encodeURIComponent(id)}`);
        return message(`Deleted todo ${id}.`);
      }),
  );

  // ---------------------------------------------------------------- goals

  server.registerTool(
    "create_goal",
    {
      title: "Create goal",
      description:
        "Add a goal for a calendar month: a bigger objective than a todo, shown in the month's goal " +
        "carousel. It goes to the end of that month's goals. Returns the created goal with its id.",
      inputSchema: {
        title: Title.describe("Short name of the goal, 1 to 200 characters."),
        color: GoalColor.describe("Accent color for the goal card."),
        month: goalMonth("the goal is for"),
        description: LongText.optional().describe("Optional longer explanation of the goal, up to 2000 characters."),
        completed,
        completedOn,
      },
      outputSchema: GoalSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (args) => call(async () => json(await api.request<Goal>("POST", "/goals", withCompletionDate(args)))),
  );

  server.registerTool(
    "update_goal",
    {
      title: "Update goal",
      description:
        "Change an existing goal; only the fields you pass are changed. Use it to rename it, edit " +
        "its description or color, check it off or un-check it, move it to another month, or " +
        "reorder it among that month's goals (position). A goal moved to another month goes to the " +
        "end of that month's goals unless you also pass position. Returns the updated goal.",
      inputSchema: {
        id: id("goal"),
        title: Title.optional().describe("New name, 1 to 200 characters."),
        description: LongText.optional().describe(
          "New description, up to 2000 characters. Pass null or an empty string to remove it.",
        ),
        color: GoalColor.optional().describe("New accent color."),
        month: goalMonth("to move the goal to").optional(),
        position,
        completed,
        completedOn,
      },
      outputSchema: GoalSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ id, ...body }) =>
      call(async () =>
        json(await api.request<Goal>("PATCH", `/goals/${encodeURIComponent(id)}`, withCompletionDate(body))),
      ),
  );

  server.registerTool(
    "delete_goal",
    {
      title: "Delete goal",
      description:
        "Permanently delete a goal. It is removed from the board and from history, and this cannot " +
        "be undone. To record that a goal was achieved, use update_goal with completed: true instead.",
      inputSchema: { id: id("goal") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ id }) =>
      call(async () => {
        await api.request("DELETE", `/goals/${encodeURIComponent(id)}`);
        return message(`Deleted goal ${id}.`);
      }),
  );

  return server;
}
