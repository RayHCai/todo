import { GOAL_COLORS, type GoalColor } from "@todo/shared";
import { AnimatePresence, motion, useAnimate, useReducedMotion, type Variants } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useCreateItem, useDeleteItem, useEditItem } from "../../api/mutations";
import { useBoard } from "../../api/queries";
import { isGoal, locate, type Item, type ItemType } from "../../lib/board";
import { keyOf } from "../../lib/keys";
import { spring } from "../../motion/tokens";
import { Frame } from "../../sketch/Sketch";
import { useUi, type ModalState, type Origin } from "../../store/ui";
import { centerOf, emitFx } from "../fx/fx";
import styles from "./ItemModal.module.css";

const TYPES: { type: ItemType; label: string }[] = [
  { type: "today", label: "Today" },
  { type: "tomorrow", label: "Tomorrow" },
  { type: "week", label: "This Week" },
  { type: "goal", label: "Goal" },
];

/** Where the panel came from and where it goes when it closes. */
type Target = Origin | undefined;
const exitTarget: { current: Target } = { current: undefined };

const isPhone = () => window.matchMedia("(max-width: 639px)").matches;
const PANEL_W = 520;
const PANEL_H = 380;

function morph(o: Target) {
  if (isPhone()) return { y: "100%", opacity: 1 };
  if (!o) return { scale: 0.96, opacity: 0 };
  const w = Math.min(PANEL_W, window.innerWidth - 32);
  return {
    x: o.x + o.width / 2 - window.innerWidth / 2,
    y: o.y + o.height / 2 - window.innerHeight / 2,
    scaleX: Math.max(0.15, o.width / w),
    scaleY: Math.max(0.1, o.height / PANEL_H),
    opacity: 0,
  };
}

const panelVariants: Variants = {
  from: (o: Target) => morph(o),
  shown: { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1 },
  to: (o: Target) => ({ ...morph(o), transition: { ...spring.smooth, opacity: { duration: 0.198, delay: 0.072 } } }),
};

/** The destination an item lands in, for the "fly toward it" exit and the landing ripple. */
const destinationOf = (type: ItemType): Element | null =>
  document.querySelector(type === "goal" ? 'section[aria-label="Goals"]' : `[data-column="${type}"]`);

export function ItemModal() {
  const modal = useUi((s) => s.modal);
  return (
    <AnimatePresence custom={exitTarget.current}>
      {modal && <Modal key={modal.mode === "edit" ? `edit-${modal.itemId}` : `create-${modal.type}`} modal={modal} />}
    </AnimatePresence>
  );
}

function Modal({ modal }: { modal: ModalState }) {
  const closeModal = useUi((s) => s.closeModal);
  const reduced = useReducedMotion();
  const { data: board } = useBoard(true);
  const create = useCreateItem();
  const edit = useEditItem();
  const del = useDeleteItem();

  const item: Item | null = useMemo(() => {
    if (modal.mode !== "edit" || !board) return null;
    return locate(board, modal.itemId)?.item ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot once: the modal edits the item as it was when opened
  }, []);

  const initial = useMemo(() => {
    const goal = item && isGoal(item) ? item : null;
    const used = new Set(board?.goals.active.map((g) => g.color));
    return {
      type: modal.type,
      title: item?.title ?? "",
      notes: (goal ? goal.description : item && !isGoal(item) ? item.notes : null) ?? "",
      color: (goal?.color ?? GOAL_COLORS.find((c) => !used.has(c)) ?? "amber") as GoalColor,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial form values are fixed when the modal opens
  }, []);

  const [type, setType] = useState<ItemType>(initial.type);
  const [title, setTitle] = useState(initial.title);
  const [notes, setNotes] = useState(initial.notes);
  const [color, setColor] = useState<GoalColor>(initial.color);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldScope, animateField] = useAnimate<HTMLDivElement>();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<Element | null>(document.activeElement);

  // The edited item vanished (deleted elsewhere, or the board refetched without it).
  useEffect(() => {
    if (modal.mode === "edit" && !item) closeModal();
  }, [modal.mode, item, closeModal]);

  useLayoutEffect(() => autogrow(notesRef.current), [notes]);

  function close(to: Target = modal.origin) {
    exitTarget.current = to;
    closeModal();
    // Focus returns to whatever opened the modal (done here, not in an effect cleanup, so
    // StrictMode's rehearsal unmount can't steal focus from the title field).
    const el = opener.current;
    if (el instanceof HTMLElement && el.isConnected) el.focus({ preventScroll: true });
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const clean = title.trim();
    if (!clean) {
      setError("Give it a title.");
      if (!reduced && fieldScope.current)
        void animateField(fieldScope.current, { x: [0, -8, 7, -4, 2, 0] }, { duration: 0.324 });
      titleRef.current?.focus();
      return;
    }
    const cleanNotes = notes.trim() || null;
    const dest = destinationOf(type);
    const destRect = dest?.getBoundingClientRect();
    let landedKey: string | null = null;

    if (modal.mode === "create") {
      landedKey = create({ type, title: clean, notes: cleanNotes, color });
    } else if (item) {
      edit.mutate({ item, to: type, title: clean, notes: cleanNotes, color });
      landedKey = type !== modal.type ? keyOf(item.id) : null;
    }

    setSaved(true);
    window.setTimeout(
      () => {
        const moved = modal.mode === "create" || type !== modal.type;
        close(
          moved && destRect
            ? { x: destRect.left, y: destRect.top, width: destRect.width, height: Math.min(destRect.height, 120) }
            : modal.origin,
        );
        if (landedKey) announceLanding(landedKey, dest);
      },
      reduced ? 0 : 180,
    );
  }

  function remove() {
    if (!item) return;
    close();
    const el = document.querySelector(`[data-key="${keyOf(item.id)}"]`);
    const anim =
      !reduced && el
        ? el.animate(
            [
              { transform: "scaleX(1)", opacity: 1 },
              { transform: "scaleX(0.6)", opacity: 0 },
            ],
            { duration: 180, easing: "ease-in", fill: "forwards" },
          )
        : null;
    if (anim) void anim.finished.then(() => del.mutate(item)).catch(() => del.mutate(item));
    else del.mutate(item);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") trapFocus(e, panelRef.current);
  }

  const accent = type === "goal" ? `var(--goal-${color})` : "var(--ink)";
  const phone = isPhone();

  return (
    <div className={styles.root} onKeyDown={onKeyDown}>
      <motion.div
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.18 } }}
        onClick={() => close()}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-modal-title"
        className={styles.panel}
        style={{ "--accent": accent } as CSSProperties}
        custom={modal.origin}
        variants={panelVariants}
        initial="from"
        animate="shown"
        exit="to"
        transition={spring.smooth}
        drag={phone ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) close();
        }}
      >
        <Frame seed="modal" className={styles.frame} a={1.4} />
        {phone && <span className={styles.handle} aria-hidden="true" />}
        <h2 id="item-modal-title" className="sr-only">
          {modal.mode === "create" ? "New item" : `Edit ${initial.title}`}
        </h2>
        <form className={styles.form} onSubmit={submit}>
          <motion.div
            initial="hidden"
            animate="shown"
            transition={{ staggerChildren: 0.036, delayChildren: 0.072 }}
            className={styles.fields}
          >
            <motion.div variants={field}>
              <TypeSegmented value={type} onChange={setType} />
            </motion.div>

            <motion.div variants={field} ref={fieldScope} className={styles.titleField}>
              <input
                ref={titleRef}
                className={styles.title}
                value={title}
                maxLength={200}
                autoFocus
                placeholder={type === "goal" ? "What do you want to make true?" : "What needs doing?"}
                aria-label="Title"
                aria-invalid={!!error}
                aria-describedby={error ? "title-error" : undefined}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError(null);
                }}
              />
              <AnimatePresence>
                {error && (
                  <motion.p
                    id="title-error"
                    className={styles.error}
                    role="alert"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            <motion.div variants={field}>
              <textarea
                ref={notesRef}
                className={styles.notes}
                value={notes}
                rows={2}
                maxLength={2000}
                placeholder={type === "goal" ? "Description" : "Notes"}
                aria-label={type === "goal" ? "Description" : "Notes"}
                onChange={(e) => setNotes(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </motion.div>

            <AnimatePresence initial={false}>
              {type === "goal" && (
                <motion.div
                  key="colors"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={spring.smooth}
                  style={{ overflow: "hidden" }}
                >
                  <ColorPicker value={color} onChange={setColor} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className={styles.actions}>
            {modal.mode === "edit" && (
              <button type="button" className={`${styles.secondary} ${styles.delete}`} onClick={remove}>
                Delete
              </button>
            )}
            <button type="button" className={styles.secondary} onClick={() => close()}>
              Cancel
            </button>
            <motion.button
              type="submit"
              className={styles.primary}
              whileTap={{ scale: 0.95 }}
              transition={spring.snappy}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {saved ? (
                  <motion.span
                    key="ok"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={spring.bouncy}
                  >
                    ✓
                  </motion.span>
                ) : (
                  <motion.span key="label" exit={{ scale: 0.6, opacity: 0 }}>
                    {modal.mode === "create" ? "Add" : "Save"}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

const field: Variants = {
  hidden: { opacity: 0, y: 6 },
  shown: { opacity: 1, y: 0, transition: spring.smooth },
};

function TypeSegmented({ value, onChange }: { value: ItemType; onChange: (t: ItemType) => void }) {
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = TYPES.findIndex((t) => t.type === value);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = TYPES[(next + TYPES.length) % TYPES.length]!;
    onChange(t.type);
    (e.currentTarget.querySelector(`[data-type="${t.type}"]`) as HTMLElement | null)?.focus();
  }
  return (
    <div className={styles.segmented} role="radiogroup" aria-label="Type" onKeyDown={onKey}>
      {TYPES.map((t) => (
        <button
          key={t.type}
          type="button"
          role="radio"
          data-type={t.type}
          aria-checked={value === t.type}
          tabIndex={value === t.type ? 0 : -1}
          className={styles.segment}
          onClick={() => onChange(t.type)}
        >
          {value === t.type && (
            <motion.span layoutId="segment-pill" className={styles.pill} transition={spring.snappy} />
          )}
          <span className={styles.segLabel}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: GoalColor; onChange: (c: GoalColor) => void }) {
  return (
    <div className={styles.colors} role="radiogroup" aria-label="Color">
      {GOAL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          className={styles.swatch}
          style={{ color: `var(--goal-${c})` }}
          onClick={() => onChange(c)}
        >
          <span className={styles.chip} />
          {value === c && <motion.span layoutId="swatch-ring" className={styles.ring} transition={spring.bouncy} />}
        </button>
      ))}
    </div>
  );
}

function autogrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
}

function trapFocus(e: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const focusables = [
    ...root.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, [tabindex="0"]'),
  ].filter((el) => el.offsetParent !== null);
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Once the new item is in the DOM, scroll it into view and ripple out from it. */
function announceLanding(key: string, fallback: Element | null) {
  window.setTimeout(() => {
    const el = document.querySelector(`[data-key="${key}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    emitFx({ kind: "ripple", ...centerOf(el ?? fallback) });
  }, 234);
}
