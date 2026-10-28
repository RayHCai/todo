import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardKey, listsKey } from "../api/queries";
import { Console } from "../features/console/Console";
import { useConsoleShortcut } from "../features/nav/useShortcuts";
import type { Board } from "../lib/board";
import type { Lists } from "../lib/lists";
import { useUi } from "../store/ui";
import { board, lists } from "./fixtures";

function setup() {
  const data = board();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData(boardKey(data.dates.today), data);
  qc.setQueryData(listsKey, lists());
  useUi.setState({
    today: data.dates.today,
    auth: "open",
    page: "board",
    list: null,
    console: false,
    modal: null,
    calendar: null,
    toasts: [],
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<WithShortcut />, { wrapper });
  return { qc, today: data.dates.today, user: userEvent.setup() };
}

function WithShortcut() {
  useConsoleShortcut();
  // Something focused behind the console, like a page's own field.
  useEffect(() => document.getElementById("behind")?.focus(), []);
  return (
    <>
      <input id="behind" aria-label="Behind" />
      <Console />
    </>
  );
}

describe("console", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    ),
  );
  afterEach(() => vi.unstubAllGlobals());

  it("opens with Ctrl+K, even from a text field, and Escape closes it", async () => {
    const { user } = setup();
    expect(screen.getByLabelText("Behind")).toHaveFocus();

    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("combobox", { name: "Command" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(useUi.getState().console).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Console" })).toBeNull());
    expect(screen.getByLabelText("Behind")).toHaveFocus();
  });

  it("goes to a list by keyword", async () => {
    const { user } = setup();
    await user.keyboard("{Control>}k{/Control}work{Enter}");
    expect(useUi.getState()).toMatchObject({ page: "lists", list: "work", console: false });
  });

  it("adds an undated task to a list picked with the arrow keys", async () => {
    const { qc, user } = setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("work");
    // "Go to: Work" is first; one down is "Add to: Work".
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Work");
    await user.keyboard("{Enter}");

    const title = screen.getByRole("textbox", { name: "New task in Work" });
    expect(title).toHaveFocus();
    await user.keyboard("Draft the brief{Enter}");

    const task = qc.getQueryData<Lists>(listsKey)?.tasks.find((t) => t.title === "Draft the brief");
    expect(task).toMatchObject({ listId: "work", date: null });
    expect(useUi.getState().console).toBe(false);
    // Added from the board, so a toast says where it went.
    expect(useUi.getState().toasts.at(-1)?.message).toBe("Added “Draft the brief” to Work");
  });

  it("adds a todo to Tomorrow, and Backspace on an empty title goes back", async () => {
    const { qc, today, user } = setup();
    await user.keyboard("{Control>}k{/Control}tom");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("textbox", { name: "New task for tomorrow" })).toHaveFocus();

    await user.keyboard("{Backspace}");
    expect(screen.getByRole("combobox", { name: "Command" })).toHaveValue("");

    await user.keyboard("add tomorrow{Enter}Call the bank{Enter}");
    const added = qc.getQueryData<Board>(boardKey(today))?.tomorrow.active.at(-1);
    expect(added?.title).toBe("Call the bank");
  });
});
