import type { Todo } from "@todo/shared";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ColumnKey } from "../../lib/board";
import { keyOf } from "../../lib/keys";
import { Roll } from "../../motion/Roll";
import { spring, stagger } from "../../motion/tokens";
import { line, rect, rng, wob } from "../../sketch/paths";
import { ChevronIcon, PlusIcon, StretchLine } from "../../sketch/Sketch";
import { originOf, useUi } from "../../store/ui";
import { TodoRow } from "./TodoRow";
import styles from "./TodoColumn.module.css";

interface Props {
  column: ColumnKey;
  title: string;
  /** "Tue, Oct 6" or "Oct 4 – Oct 10"; rolls like an odometer at midnight. */
  subtitle: string;
  /** A spoken version of the subtitle for the header's label. */
  spokenDate: string;
  active: Todo[];
  completed: Todo[];
  /** Changes at midnight rollover, sliding the old contents out and the new ones in. */
  windowKey: string;
  index: number;
}

const EMPTY_COPY: Record<ColumnKey, string> = {
  today: "Nothing for today — yet.",
  tomorrow: "Nothing for tomorrow — yet.",
  week: "Nothing this week — yet.",
};

const storageKey = (c: ColumnKey) => `ink.completed.${c}.open`;
function readOpen(c: ColumnKey): boolean {
  try {
    return localStorage.getItem(storageKey(c)) !== "false";
  } catch {
    return true;
  }
}

export function TodoColumn({ column, title, subtitle, spokenDate, active, completed, windowKey, index }: Props) {
  const openCreate = useUi((s) => s.openCreate);
  const headRef = useRef<HTMLButtonElement>(null);
  const [open, setOpenState] = useState(() => readOpen(column));
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      try {
        localStorage.setItem(storageKey(column), String(next));
      } catch {
        // Not persisted in private mode.
      }
    },
    [column],
  );

  // Completing something reveals the section so you can watch it land.
  const completedCount = completed.length;
  const prevCount = useRef(completedCount);
  useEffect(() => {
    if (completedCount > prevCount.current && !open) setOpen(true);
    prevCount.current = completedCount;
  }, [completedCount, open, setOpen]);

  const create = () => openCreate(column, originOf(headRef.current));
  const empty = active.length === 0 && completed.length === 0;

  return (
    <section className={styles.col} data-column={column} aria-label={title}>
      <motion.button
        ref={headRef}
        className={styles.head}
        onClick={create}
        whileTap={{ scale: 0.97 }}
        transition={spring.snappy}
        aria-label={`Add todo for ${title}, ${spokenDate}`}
        aria-keyshortcuts={column === "today" ? "N" : undefined}
      >
        <span className={styles.label}>
          <span className={styles.name}>{title}</span>
          <Roll value={subtitle} className={styles.date} stagger={0.0108} />
          <StretchLine
            seed={`head-${column}`}
            className={styles.line}
            style={{ animationDelay: `${300 + index * 90}ms` }}
          />
        </span>
        <span className={styles.plus} aria-hidden="true">
          <PlusIcon />
        </span>
      </motion.button>

      <ScrollBody>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={windowKey}
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -48, opacity: 0 }}
            transition={spring.smooth}
          >
            {empty ? (
              <EmptyState column={column} onOpen={create} />
            ) : (
              <LayoutGroup id={column}>
                <ul className={styles.list}>
                  {active.map((t, i) => (
                    <TodoRow key={keyOf(t.id)} todo={t} column={column} index={i} />
                  ))}
                </ul>
                <motion.button
                  layout="position"
                  className={styles.doneHead}
                  aria-expanded={open}
                  aria-controls={`done-${column}`}
                  onClick={() => setOpen(!open)}
                  transition={spring.smooth}
                >
                  <ChevronIcon dir="down" className={styles.chev} />
                  Completed <Roll value={completed.length} />
                </motion.button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.ul
                      id={`done-${column}`}
                      className={styles.list}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{
                        height: "auto",
                        opacity: 1,
                        transition: { ...spring.smooth, staggerChildren: stagger },
                      }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={spring.smooth}
                      style={{ overflow: "hidden" }}
                    >
                      {completed.map((t, i) => (
                        <TodoRow key={keyOf(t.id)} todo={t} column={column} index={i} />
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </LayoutGroup>
            )}
          </motion.div>
        </AnimatePresence>
      </ScrollBody>
    </section>
  );
}

/** Scrolls on its own, with fade masks only where there is more content and a hairline when scrolled. */
function ScrollBody({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }));
  }, []);
  const frame = useRef(0);
  const onScroll = useCallback(() => {
    frame.current ||= requestAnimationFrame(() => {
      frame.current = 0;
      measure();
    });
  }, [measure]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure]);
  return (
    <div
      ref={ref}
      className={styles.body}
      data-top={edges.top || undefined}
      data-bottom={edges.bottom || undefined}
      onScroll={onScroll}
    >
      {children}
    </div>
  );
}

/** A small sketched sheet with a pencil that idly bobs. */
function EmptyState({ column, onOpen }: { column: ColumnKey; onOpen: () => void }) {
  const paths = useMemo(() => {
    const r = rng(`empty-${column}`);
    return {
      sheet: rect(48, 56, r, 3, 0.9),
      lines: [
        line(11, 20, 37, 20, r, { a: 0.5, n: 5 }),
        line(11, 29, 33, 29, r, { a: 0.5, n: 5 }),
        line(11, 38, 27, 38, r, { a: 0.5, n: 4 }),
      ],
      pencil: wob(
        [
          [0, 0],
          [22, -22],
          [26, -18],
          [4, 4],
          [-1, 5],
          [0, 0],
        ],
        r,
        0.4,
      ),
    };
  }, [column]);
  return (
    <button className={styles.empty} onClick={onOpen}>
      <svg className={`sk ${styles.sheet}`} viewBox="-6 -10 72 74" aria-hidden="true">
        <path d={paths.sheet} />
        {paths.lines.map((d, i) => (
          <path key={i} d={d} opacity={0.6} />
        ))}
        <g className={styles.pencil} transform="translate(38 44)">
          <path d={paths.pencil} />
        </g>
      </svg>
      <span>{EMPTY_COPY[column]}</span>
    </button>
  );
}
