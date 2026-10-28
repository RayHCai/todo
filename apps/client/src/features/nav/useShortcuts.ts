import { useEffect } from "react";
import { monthKey } from "../../lib/dates";
import { originOf, useUi, type Page } from "../../store/ui";

/** The Lists page's "Add to …" field, focused by N. */
export const ADD_TASK_INPUT_ID = "lists-add";

/** Opens the calendar on this month, growing out of the header's calendar icon. */
export function openMonthView() {
  const ui = useUi.getState();
  const icon = document.querySelector('[aria-label="Open calendar"]')?.getBoundingClientRect();
  ui.openCalendar(
    monthKey(ui.today),
    icon ? { x: icon.left + icon.width / 2, y: icon.top + icon.height / 2 } : undefined,
  );
}

/** Ctrl+K (⌘K on a Mac) toggles the command console, over the browser's own Ctrl+K, even while typing. */
export function useConsoleShortcut() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ui = useUi.getState();
      if (e.key.toLowerCase() !== "k" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (ui.auth !== "open") return;
      e.preventDefault();
      if (!ui.modal) ui.setConsole(!ui.console);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * N new todo (on Lists: focus the add field) · G new goal · D board · L lists · M calendar
 * (C toggles it). T and ← → belong to the calendar while it's open.
 */
export function useShortcuts(page: Page) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ui = useUi.getState();
      const t = e.target;
      if (e.metaKey || e.ctrlKey || e.altKey || ui.modal || ui.auth !== "open") return;
      if (
        t instanceof HTMLElement &&
        (t.matches("input:not([type=checkbox]), textarea, select") || t.isContentEditable)
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        if (page === "board") {
          ui.openCreate("today", originOf(document.querySelector('[data-column="today"] button')));
        } else if (!ui.calendar) {
          document.getElementById(ADD_TASK_INPUT_ID)?.focus();
        }
      } else if (key === "g" && page === "board") {
        e.preventDefault();
        ui.openCreate("goal", originOf(document.querySelector('section[aria-label="Goals"]')));
      } else if (key === "d" || key === "l") {
        // D: the day view (Today / Tomorrow / This Week). L: the Lists page.
        e.preventDefault();
        if (ui.calendar) ui.closeCalendar();
        ui.setPage(key === "d" ? "board" : "lists");
      } else if (key === "c" || key === "m") {
        // M: the month view. C still toggles it.
        e.preventDefault();
        if (ui.calendar) {
          if (key === "c") ui.closeCalendar();
        } else {
          openMonthView();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page]);
}
