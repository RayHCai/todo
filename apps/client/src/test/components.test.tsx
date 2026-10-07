import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToggleComplete } from "../api/mutations";
import { boardKey } from "../api/queries";
import { Board } from "../features/board/Board";
import { emitFx } from "../features/fx/fx";
import { FxLayer } from "../features/fx/FxLayer";
import { ItemModal } from "../features/modal/ItemModal";
import type { Board as BoardData } from "../lib/board";
import { useUi } from "../store/ui";
import { board } from "./fixtures";
import { setReducedMotion } from "./setup";

function setup(data: BoardData = board()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData(boardKey(data.dates.today), data);
  useUi.setState({ today: data.dates.today, auth: "open", modal: null, calendar: null, toasts: [] });
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
