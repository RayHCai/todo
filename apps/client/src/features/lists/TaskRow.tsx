import type { ListTask } from "@todo/shared";
import { format } from "date-fns";
import { motion, useAnimate } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDeleteTask, useUpdateTask } from "../../api/lists";
import { fromIso, type IsoDate } from "../../lib/dates";
import { keyOf } from "../../lib/keys";
import { dueLabel, isDone, isLate, quickDates } from "../../lib/lists";
import { spring } from "../../motion/tokens";
import { Checkbox } from "../../sketch/Checkbox";
import { CalendarIcon, CloseIcon, StretchLine } from "../../sketch/Sketch";
import { useUi } from "../../store/ui";
import { emitFx } from "../fx/fx";
import { InlineEdit } from "./InlineEdit";
import { Popover, PopoverOption } from "./Popover";
import popover from "./Popover.module.css";
import styles from "./TaskRow.module.css";

/** Check → tick and strike draw → a big tick crosses the page → the row moves to Done. */
const TRAVEL_DELAY = 468;
const UNCHECK_DELAY = 216;

export function TaskRow({ task, today, accent }: { task: ListTask; today: IsoDate; accent: string }) {
  const key = keyOf(task.id);
  const done = isDone(task);
  const landed = useUi((s) => s.landed[key]);
  const shaken = useUi((s) => s.shaken[key]);
  const update = useUpdateTask();
  const del = useDeleteTask();
  const [checked, setChecked] = useState(done);
  const [editing, setEditing] = useState(false);
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null);
  const [scope, animate] = useAnimate<HTMLLIElement>();
  const timer = useRef<number>(undefined);
  const closeDates = useCallback(() => setDateAnchor(null), []);

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
        if (next !== done) update.mutate({ task, patch: { completed: next } });
      },
      next ? TRAVEL_DELAY : UNCHECK_DELAY,
    );
  }

  function rename(text: string) {
    setEditing(false);
    const clean = text.trim();
    // Clearing the title deletes the task (with undo).
    if (!clean) del.mutate(task);
    else if (clean !== task.title) update.mutate({ task, patch: { title: clean } });
  }

  function pickDate(date: IsoDate | null) {
    setDateAnchor(null);
    if (date !== task.date) update.mutate({ task, patch: { date } });
  }

  const due = task.date ? dueLabel(task.date, today) : null;
  const late = isLate(task, today);

  return (
    <motion.li
      ref={scope}
      layout="position"
      layoutId={`task-${key}`}
      data-key={key}
      className={`${styles.row} ${checked ? styles.checked : ""} ${landed ? styles.landed : ""}`}
      initial={landed ? { opacity: 0, y: -10, scale: 0.98 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={landed ? spring.bouncy : spring.smooth}
    >
      <Checkbox
        seed={key}
        checked={checked}
        label={`${done ? "Reopen" : "Complete"} ${task.title}`}
        onChange={onCheck}
      />
      {editing ? (
        <InlineEdit
          value={task.title}
          label="Task title"
          maxLength={200}
          className={styles.edit}
          onDone={rename}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button className={styles.title} title="Rename" onClick={() => setEditing(true)}>
          <span className={styles.text}>{task.title}</span>
          <StretchLine seed={key} className={styles.strike} wave={0.8} />
        </button>
      )}
      <span className={styles.meta}>
        <button
          className={`${styles.chip} ${due ? "" : styles.undated} ${late ? styles.late : ""}`}
          aria-label={due ? `Due ${due}. Change the date of ${task.title}` : `Add a date to ${task.title}`}
          aria-expanded={dateAnchor !== null}
          onClick={(e) => setDateAnchor(dateAnchor ? null : e.currentTarget)}
        >
          <CalendarIcon />
          <span>{due ?? "Add date"}</span>
        </button>
        <button className={styles.del} aria-label={`Delete ${task.title}`} onClick={() => del.mutate(task)}>
          <CloseIcon />
        </button>
      </span>
      {dateAnchor && (
        <Popover anchor={dateAnchor} label={`Date for ${task.title}`} accent={accent} onClose={closeDates}>
          <DatePicker date={task.date} today={today} onPick={pickDate} />
        </Popover>
      )}
    </motion.li>
  );
}

const short = (date: IsoDate) => format(fromIso(date), "MMM d");

function DatePicker({
  date,
  today,
  onPick,
}: {
  date: IsoDate | null;
  today: IsoDate;
  onPick: (date: IsoDate | null) => void;
}) {
  return (
    <>
      {quickDates(today).map((q) => (
        <PopoverOption key={q.label} hint={short(q.date)} onClick={() => onPick(q.date)}>
          {q.label}
        </PopoverOption>
      ))}
      <div className={popover.divider} />
      <label className={popover.pick}>
        <CalendarIcon />
        <input
          type="date"
          defaultValue={date ?? ""}
          aria-label="Pick a date"
          onChange={(e) => {
            // While a year is typed digit by digit the field passes through "0002-…"; wait for a real one.
            const value = e.target.value;
            if (value >= "1900-01-01") onPick(value);
          }}
        />
      </label>
      {date && (
        <PopoverOption danger onClick={() => onPick(null)}>
          Remove date
        </PopoverOption>
      )}
    </>
  );
}
