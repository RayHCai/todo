import type { Todo } from "@todo/shared";
import { format } from "date-fns";
import { motion, useAnimate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useToggleComplete } from "../../api/mutations";
import type { ColumnKey } from "../../lib/board";
import { fromIso, weekdayShort } from "../../lib/dates";
import { keyOf } from "../../lib/keys";
import { isEntering } from "../../motion/entrance";
import { spring } from "../../motion/tokens";
import { Checkbox } from "../../sketch/Checkbox";
import { NotesIcon, StretchLine } from "../../sketch/Sketch";
import { originOf, useUi } from "../../store/ui";
import { emitFx } from "../fx/fx";
import styles from "./TodoRow.module.css";

/** Check → tick and strike draw → a big tick crosses the page → the row travels to Completed. */
const TRAVEL_DELAY = 468;
const UNCHECK_DELAY = 216;

export function TodoRow({ todo, column, index }: { todo: Todo; column: ColumnKey; index: number }) {
  const key = keyOf(todo.id);
  const done = todo.completedAt !== null;
  const openEdit = useUi((s) => s.openEdit);
  const landed = useUi((s) => s.landed[key]);
  const shaken = useUi((s) => s.shaken[key]);
  const toggle = useToggleComplete();
  const [checked, setChecked] = useState(done);
  const [scope, animate] = useAnimate<HTMLLIElement>();
  const timer = useRef<number>(undefined);

  // The cache is the truth once the row has moved (or rolled back).
  useEffect(() => setChecked(done), [done]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!shaken || !scope.current) return;
    void animate(scope.current, { x: [0, -7, 6, -3, 2, 0] }, { duration: 0.342 });
  }, [shaken, animate, scope]);

  function onCheck(next: boolean) {
    setChecked(next);
    window.clearTimeout(timer.current);
    if (next) window.setTimeout(() => emitFx({ kind: "tick" }), 234);
    timer.current = window.setTimeout(
      () => {
        if (next !== done) toggle.mutate({ item: todo, completed: next });
      },
      next ? TRAVEL_DELAY : UNCHECK_DELAY,
    );
  }

  const carried =
    todo.carriedOver && !done
      ? todo.scope === "DAY"
        ? weekdayShort(todo.date)
        : format(fromIso(todo.date), "MMM d")
      : null;

  return (
    <motion.li
      ref={scope}
      layout="position"
      layoutId={`todo-${key}`}
      data-key={key}
      className={`${styles.row} ${checked ? styles.checked : ""} ${done ? styles.done : ""} ${landed ? styles.landed : ""}`}
      initial={landed ? { opacity: 0, y: -10, scale: 0.98 } : isEntering() ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        landed ? spring.bouncy : { ...spring.smooth, delay: isEntering() ? 0.27 + Math.min(index, 10) * 0.036 : 0 }
      }
    >
      <Checkbox
        seed={key}
        checked={checked}
        label={`${done ? "Reopen" : "Complete"} ${todo.title}`}
        onChange={onCheck}
      />
      <button
        className={styles.title}
        onClick={(e) => openEdit(column, todo.id, originOf(e.currentTarget.closest("li")))}
      >
        <span className={styles.text}>{todo.title}</span>
        <StretchLine seed={key} className={styles.strike} wave={0.8} />
      </button>
      {(carried || todo.notes) && (
        <span className={styles.meta}>
          {carried && (
            <motion.span
              className={styles.chip}
              title={`Carried over from ${carried}`}
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, -7, 6, -3, 0] }}
              transition={{ duration: 0.54, delay: 0.45 + index * 0.036 }}
            >
              ↺ {carried}
            </motion.span>
          )}
          {todo.notes && (
            <span className={styles.notes} role="img" aria-label="Has notes" title="Has notes">
              <NotesIcon />
            </span>
          )}
        </span>
      )}
    </motion.li>
  );
}
