import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { spring } from "../../motion/tokens";
import { Frame } from "../../sketch/Sketch";
import styles from "./Popover.module.css";

/**
 * A small sketched card under the button that opened it. Escape, a click outside or scrolling
 * closes it. Rendered into <body> so no transformed ancestor can shift its fixed position.
 */
export function Popover({
  anchor,
  label,
  accent,
  width = 220,
  onClose,
  children,
}: {
  anchor: HTMLElement;
  label: string;
  /** Color of the marker frame. */
  accent: string;
  width?: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Below the anchor, right-aligned to it; above it when there's no room underneath.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
    let y = r.bottom + 6;
    if (y + el.offsetHeight > window.innerHeight - 8) y = Math.max(8, r.top - el.offsetHeight - 6);
    setPos({ x, y });
  }, [anchor, width]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
      anchor.focus({ preventScroll: true });
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <motion.div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={styles.pop}
      style={
        {
          left: pos?.x ?? 0,
          top: pos?.y ?? 0,
          width,
          visibility: pos ? "visible" : "hidden",
          "--acc": accent,
        } as CSSProperties
      }
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring.snappy}
    >
      <Frame seed={`pop-${label}`} className={styles.frame} a={1} />
      {children}
    </motion.div>,
    document.body,
  );
}

/** One row of a popover menu, with an optional hint on the right. */
export function PopoverOption({
  children,
  hint,
  danger,
  onClick,
}: {
  children: ReactNode;
  hint?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`${styles.opt} ${danger ? styles.danger : ""}`} onClick={onClick}>
      <span>{children}</span>
      {hint && <small>{hint}</small>}
    </button>
  );
}
