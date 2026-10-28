/**
 * The Ctrl+K console's commands: where it can go and what it can add, built from the lists
 * the user has, plus the keyword matching that filters them as they type.
 */
import { format } from "date-fns";
import { fromIso, type IsoDate } from "../../lib/dates";
import { keyOf } from "../../lib/keys";
import { openCount, type Lists } from "../../lib/lists";

/** Somewhere a new item can be added. */
export type AddTarget =
  | { kind: "todo"; type: "today" | "tomorrow" | "week" }
  | { kind: "goal" }
  | { kind: "task"; listId: string }
  | { kind: "list" };

export type Action =
  | { kind: "board" }
  | { kind: "lists" }
  | { kind: "calendar" }
  | { kind: "list"; listId: string }
  | { kind: "add"; target: AddTarget };

export type Group = "Go to" | "Add to";
export const GROUPS: readonly Group[] = ["Go to", "Add to"];

export interface Command {
  id: string;
  group: Group;
  label: string;
  /** Muted text on the right: a shortcut key or a count. */
  hint?: string;
  /** A list's color, shown as a dot. */
  accent?: string;
  /** Extra words it answers to. */
  keywords?: string;
  action: Action;
  /** What the title field asks for once an add command is picked. */
  prompt?: string;
}

const accentOf = (color: string) => `var(--goal-${color})`;

export function buildCommands(lists: Lists | undefined, today: IsoDate): Command[] {
  const month = format(fromIso(today), "MMMM");
  const go: Command[] = [
    {
      id: "go-board",
      group: "Go to",
      label: "Day view",
      hint: "D",
      keywords: "board today tomorrow week",
      action: { kind: "board" },
    },
    {
      id: "go-calendar",
      group: "Go to",
      label: "Month view",
      hint: "M",
      keywords: "calendar month history",
      action: { kind: "calendar" },
    },
    { id: "go-lists", group: "Go to", label: "Lists", hint: "L", action: { kind: "lists" } },
  ];
  const add: Command[] = [
    {
      id: "add-today",
      group: "Add to",
      label: "Today",
      keywords: "task todo",
      prompt: "New task for today…",
      action: { kind: "add", target: { kind: "todo", type: "today" } },
    },
    {
      id: "add-tomorrow",
      group: "Add to",
      label: "Tomorrow",
      keywords: "task todo",
      prompt: "New task for tomorrow…",
      action: { kind: "add", target: { kind: "todo", type: "tomorrow" } },
    },
    {
      id: "add-week",
      group: "Add to",
      label: "This Week",
      keywords: "task todo",
      prompt: "New task for this week…",
      action: { kind: "add", target: { kind: "todo", type: "week" } },
    },
    {
      id: "add-goal",
      group: "Add to",
      label: `Goals for ${month}`,
      keywords: "goal month",
      prompt: `New goal for ${month}…`,
      action: { kind: "add", target: { kind: "goal" } },
    },
  ];
  for (const l of lists?.lists ?? []) {
    const key = keyOf(l.id);
    go.push({
      id: `go-list-${key}`,
      group: "Go to",
      label: l.name,
      hint: `${openCount(lists!, l.id)} open`,
      accent: accentOf(l.color),
      keywords: "list",
      action: { kind: "list", listId: l.id },
    });
    add.push({
      id: `add-list-${key}`,
      group: "Add to",
      label: l.name,
      accent: accentOf(l.color),
      keywords: "list task undated someday",
      prompt: `New task in ${l.name}…`,
      action: { kind: "add", target: { kind: "task", listId: l.id } },
    });
  }
  if (lists) {
    add.push({
      id: "add-list",
      group: "Add to",
      label: "A new list",
      keywords: "create list",
      prompt: "Name the new list…",
      action: { kind: "add", target: { kind: "list" } },
    });
  }
  return [...go, ...add];
}

const words = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean);

/** 0 if the command doesn't match every typed word; higher for word starts and label prefixes. */
function score(command: Command, query: string): number {
  const typed = words(query);
  const label = command.label.toLowerCase();
  const haystack = `${command.group} ${command.label} ${command.keywords ?? ""}`.toLowerCase();
  const tokens = words(haystack);
  let total = 0;
  for (const w of typed) {
    if (tokens.some((t) => t.startsWith(w))) total += 2;
    else if (w.length >= 3 && haystack.includes(w)) total += 1;
    else return 0;
  }
  if (label.startsWith(query.trim().toLowerCase())) total += 3;
  return total;
}

/** The commands matching the query, best first within each group (groups keep their order). */
export function matchCommands(commands: readonly Command[], query: string): Command[] {
  if (!query.trim()) return [...commands];
  const scored = commands.map((c) => ({ c, s: score(c, query) })).filter((x) => x.s > 0);
  return GROUPS.flatMap((g) =>
    scored
      .filter((x) => x.c.group === g)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c),
  );
}
