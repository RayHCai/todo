import { GOAL_COLORS, type List, type ListTask } from "@todo/shared";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useCreateList, useCreateTask, useDeleteList, useUpdateList } from "../../api/lists";
import { useLists } from "../../api/queries";
import { isTmp } from "../../lib/board";
import type { IsoDate } from "../../lib/dates";
import { keyOf } from "../../lib/keys";
import { isDone, openCount, sectionsOf, tasksOf, type Lists } from "../../lib/lists";
import { Roll } from "../../motion/Roll";
import { spring } from "../../motion/tokens";
import { ellipse, rng } from "../../sketch/paths";
import { ChevronIcon, PlusIcon, StretchLine } from "../../sketch/Sketch";
import { useUi } from "../../store/ui";
import { Header } from "../board/Header";
import { ADD_TASK_INPUT_ID, useShortcuts } from "../nav/useShortcuts";
import { InlineEdit } from "./InlineEdit";
import { Popover, PopoverOption } from "./Popover";
import { TaskRow } from "./TaskRow";
import styles from "./ListsPage.module.css";

const SELECTED_KEY = "ink.lists.selected";
const DONE_OPEN_KEY = "ink.lists.doneOpen";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the page just won't remember.
  }
}

const accentOf = (list: List) => `var(--goal-${list.color})`;

/**
 * The Lists page, "Rail" layout: one list at a time, picked from a rail on the left that
 * circles the active list in marker. Tasks split into Scheduled (dated, soonest first) and
 * Someday (undated), with Done folded away underneath.
 */
export function ListsPage() {
  const { data, isPending, isError, error, refetch } = useLists();
  const today = useUi((s) => s.today);
  const createList = useCreateList();
  const [selected, setSelected] = useState(() => read(SELECTED_KEY) ?? "");
  useShortcuts("lists");

  const lists = useMemo(() => data?.lists ?? [], [data]);
  const current = lists.find((l) => keyOf(l.id) === selected || l.id === selected) ?? lists[0] ?? null;

  // Remember the list by its server id, so a reload comes back to it.
  const currentId = current?.id;
  useEffect(() => {
    if (currentId && !isTmp(currentId)) write(SELECTED_KEY, currentId);
  }, [currentId]);

  function addList(name: string) {
    const key = createList(name);
    if (key) setSelected(key);
  }

  function onDeleteList(list: List) {
    const i = lists.findIndex((l) => l.id === list.id);
    const next = lists[i + 1] ?? lists[i - 1];
    setSelected(next ? keyOf(next.id) : "");
  }

  return (
    <div className={styles.scroller}>
      <main className={styles.page}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
          <Header title="Lists" page="lists" />
        </motion.div>
        {data && <Summary data={data} />}
        {isPending ? (
          <p className={styles.note}>Loading…</p>
        ) : isError || !data ? (
          <div className={styles.failed}>
            <p>Couldn't load your lists. {error instanceof Error ? error.message : ""}</p>
            <button onClick={() => void refetch()}>Try again</button>
          </div>
        ) : (
          <motion.div
            className={styles.split}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.smooth, delay: 0.108 }}
          >
            <Rail data={data} current={current} onSelect={(l) => setSelected(keyOf(l.id))} onCreate={addList} />
            {current ? (
              <Pane key={keyOf(current.id)} list={current} data={data} today={today} onDelete={onDeleteList} />
            ) : (
              <FirstList onCreate={addList} />
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}

function Summary({ data }: { data: Lists }) {
  const open = data.tasks.filter((t) => !isDone(t));
  const dated = open.filter((t) => t.date).length;
  const n = data.lists.length;
  return (
    <p className={`${styles.sub} tabular`}>
      {open.length} open across {n} {n === 1 ? "list" : "lists"} · {dated} with a date
    </p>
  );
}

/* ---------------- rail ---------------- */

function Rail({
  data,
  current,
  onSelect,
  onCreate,
}: {
  data: Lists;
  current: List | null;
  onSelect: (list: List) => void;
  onCreate: (name: string) => void;
}) {
  // Arrow keys move between lists (up/down on the rail, left/right on the phone strip).
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step || !current) return;
    e.preventDefault();
    const i = data.lists.findIndex((l) => l.id === current.id);
    const next = data.lists[(i + step + data.lists.length) % data.lists.length];
    if (!next) return;
    onSelect(next);
    document.getElementById(`list-tab-${keyOf(next.id)}`)?.focus();
  }

  return (
    <nav className={styles.rail} aria-label="Lists">
      {data.lists.length > 0 && (
        <div className={styles.tabs} role="tablist" aria-orientation="vertical" onKeyDown={onKey}>
          {data.lists.map((l) => {
            const key = keyOf(l.id);
            const on = l.id === current?.id;
            return (
              <button
                key={key}
                id={`list-tab-${key}`}
                role="tab"
                aria-selected={on}
                aria-controls="list-pane"
                tabIndex={on ? 0 : -1}
                className={styles.railBtn}
                style={{ "--acc": accentOf(l) } as CSSProperties}
                onClick={() => onSelect(l)}
              >
                {on && <RailRing seed={key} />}
                <span className={styles.dot} />
                <span className={styles.railName}>{l.name}</span>
                <Roll value={openCount(data, l.id)} className={styles.count} />
              </button>
            );
          })}
        </div>
      )}
      <NewList onCreate={onCreate} />
    </nav>
  );
}

/** The marker loop around the active list, drawn in when it's selected. */
function RailRing({ seed }: { seed: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    // Matches the ring's CSS box: it overhangs the button by 8px/4px on each side.
    const measure = () => {
      const w = parent.offsetWidth + 16;
      const h = parent.offsetHeight + 8;
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);
  const d = useMemo(
    () =>
      size
        ? ellipse(size.w / 2, size.h / 2, size.w / 2 - 3, size.h / 2 - 2, rng(`rail-${seed}`), {
            a: 1.2,
            n: 18,
            sweep: Math.PI * 2 + 0.5,
          })
        : "",
    [size, seed],
  );
  return (
    <svg
      ref={ref}
      className={`sk ${styles.ring}`}
      viewBox={size ? `0 0 ${size.w} ${size.h}` : undefined}
      aria-hidden="true"
    >
      {d && (
        <motion.path
          d={d}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.405, ease: "easeOut" }}
        />
      )}
    </svg>
  );
}

function NewList({ onCreate }: { onCreate: (name: string) => void }) {
  const [adding, setAdding] = useState(false);
  if (adding) {
    return (
      <InlineEdit
        value=""
        label="New list name"
        placeholder="List name"
        maxLength={60}
        className={styles.newInput}
        onDone={(text) => {
          setAdding(false);
          if (text.trim()) onCreate(text.trim());
        }}
        onCancel={() => setAdding(false)}
      />
    );
  }
  return (
    <button className={styles.newList} onClick={() => setAdding(true)}>
      <PlusIcon />
      <span>New list</span>
    </button>
  );
}

function FirstList({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) onCreate(name.trim());
  }
  return (
    <section className={styles.pane}>
      <h2 className={styles.name}>No lists yet</h2>
      <p className={styles.lead}>Lists hold what doesn't belong to a day: errands, reading, someday plans.</p>
      <form className={styles.add} onSubmit={submit}>
        <span className={styles.plus} aria-hidden="true">
          <PlusIcon />
        </span>
        <input
          value={name}
          maxLength={60}
          placeholder="Name your first list…"
          aria-label="New list name"
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </section>
  );
}

/* ---------------- pane ---------------- */

function Pane({
  list,
  data,
  today,
  onDelete,
}: {
  list: List;
  data: Lists;
  today: IsoDate;
  onDelete: (list: List) => void;
}) {
  const accent = accentOf(list);
  const tasks = useMemo(() => tasksOf(data, list.id), [data, list.id]);
  const { scheduled, someday, done } = useMemo(() => sectionsOf(tasks), [tasks]);
  const [doneOpen, setDoneOpenState] = useState(() => read(DONE_OPEN_KEY) === "true");
  const setDoneOpen = (open: boolean) => {
    setDoneOpenState(open);
    write(DONE_OPEN_KEY, String(open));
  };

  return (
    <motion.section
      id="list-pane"
      role="tabpanel"
      aria-labelledby={`list-tab-${keyOf(list.id)}`}
      className={styles.pane}
      style={{ "--acc": accent } as CSSProperties}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={spring.smooth}
    >
      <div className={styles.paneHead}>
        <ListName list={list} />
        <ListMenu list={list} taskCount={tasks.length} onDelete={onDelete} />
      </div>
      <p className={`${styles.lead} tabular`}>
        {scheduled.length + someday.length} open · {scheduled.length} scheduled
      </p>

      <LayoutGroup id="list-tasks">
        <Group title="Scheduled" tasks={scheduled} today={today} accent={accent} empty="Nothing scheduled yet" />
        <Group title="Someday" tasks={someday} today={today} accent={accent} />
        <AddTask list={list} />
        {done.length > 0 && (
          <>
            <motion.button
              layout="position"
              className={styles.doneHead}
              aria-expanded={doneOpen}
              aria-controls="list-done"
              onClick={() => setDoneOpen(!doneOpen)}
              transition={spring.smooth}
            >
              <ChevronIcon dir="down" className={styles.chev} />
              Done · <Roll value={done.length} />
            </motion.button>
            <AnimatePresence initial={false}>
              {doneOpen && (
                <motion.ul
                  id="list-done"
                  className={styles.list}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={spring.smooth}
                  style={{ overflow: "hidden" }}
                >
                  {done.map((t) => (
                    <TaskRow key={keyOf(t.id)} task={t} today={today} accent={accent} />
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </>
        )}
      </LayoutGroup>
    </motion.section>
  );
}

function Group({
  title,
  tasks,
  today,
  accent,
  empty,
}: {
  title: string;
  tasks: ListTask[];
  today: IsoDate;
  accent: string;
  empty?: string;
}) {
  return (
    <motion.div layout="position" className={styles.grp} transition={spring.smooth}>
      <div className={styles.grpHead}>
        <span>{title}</span>
        <StretchLine seed={`grp-${title}`} className={styles.rule} wave={0.5} />
        <Roll value={tasks.length} />
      </div>
      <ul className={styles.list}>
        {tasks.map((t) => (
          <TaskRow key={keyOf(t.id)} task={t} today={today} accent={accent} />
        ))}
        {tasks.length === 0 && empty && <li className={styles.none}>{empty}</li>}
      </ul>
    </motion.div>
  );
}

function AddTask({ list }: { list: List }) {
  const create = useCreateTask();
  const [title, setTitle] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    create(list.id, clean);
    setTitle("");
  }
  return (
    <motion.form layout="position" className={styles.add} onSubmit={submit} transition={spring.smooth}>
      <span className={styles.plus} aria-hidden="true">
        <PlusIcon />
      </span>
      <input
        id={ADD_TASK_INPUT_ID}
        value={title}
        maxLength={200}
        placeholder={`Add to ${list.name}…`}
        aria-label={`Add a task to ${list.name}`}
        aria-keyshortcuts="N"
        autoComplete="off"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
      />
    </motion.form>
  );
}

/** The list's name; click it to rename. */
function ListName({ list }: { list: List }) {
  const update = useUpdateList();
  const [editing, setEditing] = useState(false);
  return (
    <h2 className={styles.name}>
      {editing ? (
        <InlineEdit
          value={list.name}
          label="List name"
          maxLength={60}
          className={styles.nameInput}
          onDone={(text) => {
            setEditing(false);
            const clean = text.trim();
            if (clean && clean !== list.name) update.mutate({ list, patch: { name: clean } });
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button className={styles.nameBtn} title="Rename" onClick={() => setEditing(true)}>
          {list.name}
        </button>
      )}
    </h2>
  );
}

/** A dot in the list's color that opens its color choices and the delete action. */
function ListMenu({ list, taskCount, onDelete }: { list: List; taskCount: number; onDelete: (list: List) => void }) {
  const update = useUpdateList();
  const del = useDeleteList();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const close = useCallback(() => setAnchor(null), []);

  function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setAnchor(null);
    onDelete(list);
    del.mutate(list);
  }

  return (
    <>
      <button
        className={styles.menuBtn}
        aria-label={`Color and options for ${list.name}`}
        aria-expanded={anchor !== null}
        onClick={(e) => {
          setConfirming(false);
          setAnchor(anchor ? null : e.currentTarget);
        }}
      >
        <span className={styles.menuDot} />
      </button>
      {anchor && (
        <Popover anchor={anchor} label={`${list.name} options`} accent={accentOf(list)} width={232} onClose={close}>
          <div className={styles.swatches} role="radiogroup" aria-label="Color">
            {GOAL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === list.color}
                aria-label={c}
                className={styles.swatch}
                style={{ color: `var(--goal-${c})` }}
                onClick={() => c !== list.color && update.mutate({ list, patch: { color: c } })}
              >
                <span className={styles.swatchChip} />
                {c === list.color && (
                  <motion.span layoutId="list-swatch-ring" className={styles.swatchRing} transition={spring.bouncy} />
                )}
              </button>
            ))}
          </div>
          <PopoverOption danger onClick={remove}>
            {!confirming
              ? "Delete list"
              : taskCount > 0
                ? `Delete it and its ${taskCount} ${taskCount === 1 ? "task" : "tasks"}`
                : "Yes, delete it"}
          </PopoverOption>
        </Popover>
      )}
    </>
  );
}
