import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useCreateList, useCreateTask } from "../../api/lists";
import { useCreateItem } from "../../api/mutations";
import { useBoard, useLists } from "../../api/queries";
import { keyOf } from "../../lib/keys";
import { nextColor } from "../../lib/lists";
import { spring } from "../../motion/tokens";
import { Frame } from "../../sketch/Sketch";
import { useUi } from "../../store/ui";
import { openMonthView } from "../nav/useShortcuts";
import { buildCommands, GROUPS, matchCommands, type AddTarget, type Command } from "./commands";
import styles from "./Console.module.css";

const LISTBOX_ID = "console-options";
const optionId = (c: Command) => `console-opt-${c.id}`;

/**
 * The Ctrl+K console. Type to filter, ↑ ↓ to move, Enter to go somewhere or to pick a place
 * to add to; picking one turns the field into that item's title, and Enter adds it.
 */
export function Console() {
  const open = useUi((s) => s.console);
  return <AnimatePresence>{open && <Panel />}</AnimatePresence>;
}

function Panel() {
  const today = useUi((s) => s.today);
  const { data: board } = useBoard(true);
  const { data: lists } = useLists();
  const createItem = useCreateItem();
  const createTask = useCreateTask();
  const createList = useCreateList();

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  /** The add command picked; the field now holds the new item's title. */
  const [adding, setAdding] = useState<Command | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(document.activeElement);

  const commands = useMemo(() => buildCommands(lists, today), [lists, today]);
  const matches = useMemo(() => (adding ? [] : matchCommands(commands, query)), [adding, commands, query]);
  const current = matches[Math.min(active, matches.length - 1)];
  const naming = adding?.action.kind === "add" && adding.action.target.kind === "list";

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [adding]);

  useEffect(() => {
    if (current) document.getElementById(optionId(current))?.scrollIntoView?.({ block: "nearest" });
  }, [current]);

  function close() {
    useUi.getState().setConsole(false);
    const el = opener.current;
    if (el instanceof HTMLElement && el.isConnected) el.focus({ preventScroll: true });
  }

  function run(command: Command) {
    const { closeCalendar, setPage, showList } = useUi.getState();
    const { action } = command;
    if (action.kind === "add") {
      setAdding(command);
      setQuery("");
      return;
    }
    if (action.kind === "calendar") {
      if (!useUi.getState().calendar) openMonthView();
    } else {
      closeCalendar();
      if (action.kind === "list") showList(keyOf(action.listId));
      else setPage(action.kind);
    }
    close();
  }

  function add(target: AddTarget, title: string, label: string) {
    const { pushToast, page, calendar, closeCalendar, showList } = useUi.getState();
    if (target.kind === "list") {
      const key = createList(title);
      if (!key) return pushToast({ tone: "error", message: "Your lists are still loading." });
      closeCalendar();
      showList(key);
      return close();
    }
    if (target.kind === "task") {
      createTask(target.listId, title);
    } else {
      const color = nextColor(board?.goals.active.map((g) => g.color) ?? []);
      const type = target.kind === "goal" ? "goal" : target.type;
      if (!createItem({ type, title, notes: null, color })) {
        return pushToast({ tone: "error", message: "The board is still loading." });
      }
    }
    // Added somewhere off screen: say where it went.
    const shown = !calendar && page === (target.kind === "task" ? "lists" : "board");
    if (!shown) pushToast({ tone: "info", message: `Added “${title}” to ${label}` });
    close();
  }

  function back() {
    setAdding(null);
    setQuery("");
    setActive(0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      // Stop here so an open calendar doesn't close too.
      e.preventDefault();
      e.stopPropagation();
      if (adding) back();
      else close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (adding) {
        const title = query.trim();
        if (title && adding.action.kind === "add") add(adding.action.target, title, adding.label);
      } else if (current) {
        run(current);
      }
    } else if (e.key === "Backspace" && adding && query === "") {
      e.preventDefault();
      back();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && matches.length) {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const from = Math.min(active, matches.length - 1);
      setActive((from + step + matches.length) % matches.length);
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  }

  return (
    <div className={styles.root}>
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.126 } }}
        onClick={close}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Console"
        className={styles.panel}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.126 } }}
        transition={spring.snappy}
      >
        <Frame seed="console" className={styles.frame} a={1} />
        <div className={styles.field}>
          {adding && (
            <button
              type="button"
              className={styles.chip}
              style={{ "--acc": adding.accent ?? "var(--ink-2)" } as CSSProperties}
              title="Back to commands"
              onClick={back}
            >
              {adding.accent && <span className={styles.dot} />}
              {adding.label}
            </button>
          )}
          <input
            ref={inputRef}
            value={query}
            maxLength={adding ? (naming ? 60 : 200) : undefined}
            placeholder={adding?.prompt ?? "Go to or add to…"}
            aria-label={adding ? (adding.prompt ?? "Title").replace("…", "") : "Command"}
            role={adding ? undefined : "combobox"}
            aria-expanded={adding ? undefined : matches.length > 0}
            aria-controls={adding ? undefined : LISTBOX_ID}
            aria-activedescendant={!adding && current ? optionId(current) : undefined}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        {adding ? (
          <p className={styles.note}>
            <kbd>↵</kbd> add <span className={styles.sep}>·</span> <kbd>esc</kbd> back
          </p>
        ) : (
          <div id={LISTBOX_ID} role="listbox" aria-label="Commands" className={styles.options}>
            {matches.length === 0 && <p className={styles.empty}>Nothing matches “{query.trim()}”</p>}
            {GROUPS.map((group) => {
              const rows = matches.filter((c) => c.group === group);
              if (!rows.length) return null;
              return (
                <div key={group} role="group" aria-label={group}>
                  <div className={styles.group} aria-hidden="true">
                    {group}
                  </div>
                  {rows.map((c) => {
                    const on = c === current;
                    return (
                      <div
                        key={c.id}
                        id={optionId(c)}
                        role="option"
                        aria-selected={on}
                        className={styles.option}
                        style={{ "--acc": c.accent } as CSSProperties}
                        onPointerMove={() => !on && setActive(matches.indexOf(c))}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => run(c)}
                      >
                        {on && (
                          <motion.span layoutId="console-active" className={styles.pill} transition={spring.snappy} />
                        )}
                        {c.accent && <span className={styles.dot} />}
                        <span className={styles.label}>{c.label}</span>
                        {c.hint && <small>{c.hint}</small>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
