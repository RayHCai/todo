import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/http";
import { monthKey, monthTitle } from "../../lib/dates";
import { spring } from "../../motion/tokens";
import { ellipse, rng } from "../../sketch/paths";
import { CalendarIcon, LockIcon } from "../../sketch/Sketch";
import { useUi } from "../../store/ui";
import styles from "./Header.module.css";

export function Header({ month }: { month: string }) {
  const openCalendar = useUi((s) => s.openCalendar);
  const setAuth = useUi((s) => s.setAuth);
  const calendarOpen = useUi((s) => s.calendar !== null);
  const [locking, setLocking] = useState(false);
  const calRef = useRef<HTMLButtonElement>(null);

  function openCal() {
    const r = calRef.current?.getBoundingClientRect();
    openCalendar(monthKey(month), r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined);
  }

  async function lock() {
    setLocking(true);
    // The shackle snaps shut, then the curtains close.
    window.setTimeout(() => setAuth("relocking"), 162);
    try {
      await api.logout();
    } catch {
      // Already signed out on the server; the relock still happens.
    }
  }

  return (
    <header className={styles.header}>
      <MonthTitle text={monthTitle(month)} />
      <div className={styles.icons}>
        <button
          ref={calRef}
          className={`${styles.ib} ${styles.cal}`}
          aria-label="Open calendar"
          aria-expanded={calendarOpen}
          aria-keyshortcuts="C"
          onClick={openCal}
        >
          <CalendarIcon />
        </button>
        <button className={`${styles.ib} ${styles.sm} ${locking ? styles.shut : ""}`} aria-label="Lock" onClick={lock}>
          <LockIcon />
        </button>
      </div>
    </header>
  );
}

/**
 * "October 2026", circled twice in marker. Letters reveal from beneath a mask on entrance,
 * ripple on hover, and roll like an odometer when the month changes.
 */
function MonthTitle({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLHeadingElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const first = useRef(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Matches the loop's CSS box: it overhangs the title by 30px/16px (18px/10px on phones).
    const measure = () => {
      const small = window.innerWidth < 640;
      setSize({ w: el.offsetWidth + (small ? 36 : 60), h: el.offsetHeight + (small ? 20 : 32) });
    };
    measure();
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  const loops = useMemo(() => {
    if (!size) return null;
    const { w, h } = size;
    const r = rng(`loop-${text}`);
    const cx = w / 2;
    const cy = h / 2;
    return [
      ellipse(cx, cy, w / 2 - 6, h / 2 - 5, r, { a: 1.6, n: 24, start: Math.PI * 0.92, sweep: Math.PI * 2.1 }),
      ellipse(cx + 4, cy + 3, w / 2 - 3, h / 2 - 2, r, { a: 1.8, n: 24, start: Math.PI * 1.08, sweep: Math.PI * 1.85 }),
    ];
  }, [size, text]);

  function ripple() {
    if (reduced || !scope.current) return;
    const letters = scope.current.querySelectorAll("[data-ch]");
    letters.forEach((el, i) => {
      void animate(el, { y: [0, -5, 0] }, { duration: 0.378, delay: i * 0.027, ease: "easeInOut" });
    });
  }

  const isFirst = first.current;
  first.current = false;

  return (
    <h1 ref={ref} className={styles.title} onPointerEnter={ripple}>
      {loops && size && (
        <svg className={`sk ${styles.loop}`} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
          {loops.map((d, i) => (
            <motion.path
              key={`${text}-${i}`}
              d={d}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.495, delay: (isFirst ? 0.405 : 0.18) + i * 0.405, ease: "easeOut" }}
            />
          ))}
        </svg>
      )}
      <span className="sr-only">{text}</span>
      <span ref={scope} className={styles.letters} aria-hidden="true">
        <AnimatePresence initial mode="popLayout">
          <motion.span key={text} className={styles.word}>
            {[...text].map((ch, i) => (
              <span key={i} className={styles.mask}>
                <motion.span
                  data-ch
                  className={styles.ch}
                  initial={{ y: "105%" }}
                  animate={{ y: "0%" }}
                  exit={{ y: "-105%", transition: { duration: 0.198, delay: i * 0.0135 } }}
                  transition={{ ...spring.smooth, delay: i * 0.0225 }}
                >
                  {ch === " " ? " " : ch}
                </motion.span>
              </span>
            ))}
          </motion.span>
        </AnimatePresence>
      </span>
    </h1>
  );
}
