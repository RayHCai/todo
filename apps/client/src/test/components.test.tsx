import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToggleComplete } from "../api/mutations";
import { boardKey, listsKey } from "../api/queries";
import { Board } from "../features/board/Board";
import { CalendarOverlay } from "../features/calendar/CalendarOverlay";
import { emitFx } from "../features/fx/fx";
import { FxLayer } from "../features/fx/FxLayer";
import { ListsPage } from "../features/lists/ListsPage";
import { ItemModal } from "../features/modal/ItemModal";
import type { Board as BoardData } from "../lib/board";
import { useUi } from "../store/ui";
import { board, lists } from "./fixtures";
import { setReducedMotion } from "./setup";

function setup(data: BoardData = board()) {
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
    modal: null,
    calendar: null,
    toasts: [],
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const selectedType = () =>
  within(screen.getByRole("radiogroup", { name: "Type" })).getByRole("radio", { checked: true }).textContent;

describe("shared modal presets", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    ),
  );
  afterEach(() => vi.unstubAllGlobals());

  it("opens preset to the column whose header was clicked", async () => {
    const { wrapper } = setup();
    render(
      <>
        <Board />
        <ItemModal />
      </>,
      { wrapper },
    );
    const user = userEvent.setup();

    for (const [label, type] of [
      [/Add todo for Today/, "Today"],
      [/Add todo for Tomorrow/, "Tomorrow"],
      [/Add todo for This Week/, "This Week"],
    ] as const) {
      await user.click(screen.getByRole("button", { name: label }));
      const dialog = await screen.findByRole("dialog");
      expect(
        within(within(dialog).getByRole("radiogroup", { name: "Type" })).getByRole("radio", { checked: true }),
      ).toHaveTextContent(type);
      act(() => useUi.getState().closeModal());
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }

    await user.click(screen.getByRole("button", { name: "Add goal" }));
    await screen.findByRole("dialog");
    expect(selectedType()).toBe("Goal");
    expect(screen.getByRole("radiogroup", { name: "Color" })).toBeInTheDocument();
  });

  it("opens in edit mode from an item title, and from the N and G shortcuts", async () => {
    const { wrapper } = setup();
    render(
      <>
        <Board />
        <ItemModal />
      </>,
      { wrapper },
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Gym" }));
    await screen.findByRole("dialog");
    expect(selectedType()).toBe("Tomorrow");
    expect(screen.getByLabelText("Title")).toHaveValue("Gym");
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    act(() => useUi.getState().closeModal());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.keyboard("n");
    await screen.findByRole("dialog");
    expect(selectedType()).toBe("Today");
    act(() => useUi.getState().closeModal());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.keyboard("g");
    await screen.findByRole("dialog");
    expect(selectedType()).toBe("Goal");
  });
});

describe("optimistic completion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("moves the item instantly and rolls back when the request fails", async () => {
    let fail!: () => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            fail = () =>
              resolve(
                new Response(JSON.stringify({ error: { code: "INTERNAL", message: "Internal server error" } }), {
                  status: 500,
                }),
              );
          }),
      ),
    );
    const data = board();
    const { qc, wrapper } = setup(data);
    const { result } = renderHook(() => useToggleComplete(), { wrapper });
    const item = data.today.active[0]!;

    act(() => result.current.mutate({ item, completed: true }));
    await waitFor(() =>
      expect(qc.getQueryData<BoardData>(boardKey("2026-10-06"))?.today.completed[0]?.id).toBe(item.id),
    );

    act(() => fail());
    await waitFor(() => expect(result.current.isError).toBe(true));
    const after = qc.getQueryData<BoardData>(boardKey("2026-10-06"));
    expect(after?.today.active.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(after?.today.completed.map((t) => t.id)).toEqual(["t3"]);
    expect(useUi.getState().toasts.at(-1)).toMatchObject({ tone: "error" });
    expect(useUi.getState().shaken[item.id]).toBeDefined();
  });
});

describe("reduced motion", () => {
  afterEach(() => setReducedMotion(false));

  it("draws full-page moments normally", () => {
    const { container } = render(<FxLayer />);
    act(() => emitFx({ kind: "tick" }));
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("skips them entirely when the user prefers reduced motion", () => {
    setReducedMotion(true);
    const { container } = render(<FxLayer />);
    act(() => {
      emitFx({ kind: "tick" });
      emitFx({ kind: "ripple", x: 10, y: 10 });
      emitFx({ kind: "goal", color: "red", x: 10, y: 10 });
    });
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("lists page", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows one list at a time, split into Scheduled and Someday", async () => {
    const { wrapper } = setup();
    render(<ListsPage />, { wrapper });
    const user = userEvent.setup();

    expect(screen.getByRole("tab", { name: /Home/ })).toHaveAttribute("aria-selected", "true");
    const pane = screen.getByRole("tabpanel");
    expect(within(pane).getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(within(pane).getByText("2 open · 1 scheduled")).toBeInTheDocument();
    expect(
      within(pane).getByRole("button", { name: "Due Today. Change the date of Fix the hallway light" }),
    ).toBeInTheDocument();
    expect(within(pane).getByRole("button", { name: "Add a date to Repot the fern" })).toBeInTheDocument();
    // Done is folded away.
    expect(within(pane).queryByText("Hang the print")).toBeNull();
    await user.click(within(pane).getByRole("button", { name: /Done/ }));
    expect(within(pane).getByText("Hang the print")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Work/ }));
    expect(within(screen.getByRole("tabpanel")).getByRole("heading", { name: "Work" })).toBeInTheDocument();
    expect(screen.getByText("Write the roadmap")).toBeInTheDocument();
  });

  it("adds a task and dates it, moving it from Someday to Scheduled", async () => {
    const { wrapper } = setup();
    render(<ListsPage />, { wrapper });
    const user = userEvent.setup();

    await user.keyboard("n");
    expect(screen.getByLabelText("Add a task to Home")).toHaveFocus();
    await user.keyboard("Buy stamps{Enter}");
    expect(screen.getByLabelText("Add a task to Home")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Buy stamps" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add a date to Buy stamps" }));
    const picker = screen.getByRole("dialog", { name: "Date for Buy stamps" });
    await user.click(within(picker).getByRole("button", { name: /Tomorrow/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Due Tomorrow. Change the date of Buy stamps" })).toBeInTheDocument();
    expect(screen.getByText("3 open · 2 scheduled")).toBeInTheDocument();
  });

  it("creates a list from the rail and selects it", async () => {
    const { qc, wrapper } = setup();
    render(<ListsPage />, { wrapper });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "New list" }));
    await user.keyboard("Reading{Enter}");
    expect(screen.getByRole("tab", { name: /Reading/ })).toHaveAttribute("aria-selected", "true");
    // The first color no other list uses.
    expect(qc.getQueryData<{ lists: { name: string; color: string }[] }>(listsKey)?.lists.at(-1)).toMatchObject({
      name: "Reading",
      color: "amber",
    });
  });

  it("L opens the Lists page and D goes back to the board", async () => {
    const { wrapper } = setup();
    const { unmount } = render(<Board />, { wrapper });
    const user = userEvent.setup();
    await user.keyboard("l");
    expect(useUi.getState().page).toBe("lists");
    unmount();

    render(<ListsPage />, { wrapper });
    await user.keyboard("d");
    expect(useUi.getState().page).toBe("board");
  });
});

describe("calendar month goals", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("plans a goal for a coming month from its banner", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = setup();
    act(() => useUi.getState().openCalendar("2026-10"));
    render(<CalendarOverlay />, { wrapper });
    const user = userEvent.setup();

    // Past months can be opened but not planned.
    expect(screen.queryByRole("button", { name: "Add a goal for September 2026" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add a goal for November 2026" }));
    const detail = await screen.findByRole("dialog", { name: "Goals for November 2026" });
    expect(within(detail).getByText("No goals for this month yet.")).toBeInTheDocument();
    await user.click(within(detail).getByRole("radio", { name: "rose" }));
    await user.type(within(detail).getByLabelText("New goal for November 2026"), "Run a 10k{Enter}");

    const call = fetchMock.mock.calls.find(([url, init]) => url === "/api/goals" && init?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ title: "Run a 10k", color: "rose", month: "2026-11-01" });
  });
});
