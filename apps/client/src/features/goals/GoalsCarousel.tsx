import type { Goal } from "@todo/shared";
import useEmblaCarousel from "embla-carousel-react";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useSpring } from "motion/react";
import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useToggleComplete } from "../../api/mutations";
import { keyOf } from "../../lib/keys";
import { Roll } from "../../motion/Roll";
import { spring } from "../../motion/tokens";
import { Checkbox } from "../../sketch/Checkbox";
import { ChevronIcon, DotIcon, PlusIcon } from "../../sketch/Sketch";
import { originOf, useUi } from "../../store/ui";
import { GhostCard, GoalCard } from "./GoalCard";
import styles from "./GoalsCarousel.module.css";

const TRAY_KEY = "ink.goals.trayOpen";
const readTray = () => {
  try {
    return localStorage.getItem(TRAY_KEY) !== "false";
  } catch {
    return true;
  }
};

export function GoalsCarousel({ active, completed }: { active: Goal[]; completed: Goal[] }) {
  const openCreate = useUi((s) => s.openCreate);
  const toggle = useToggleComplete();
  const [trayOpen, setTrayOpenState] = useState(readTray);
  const setTrayOpen = useCallback((open: boolean) => {
    setTrayOpenState(open);
    try {
      localStorage.setItem(TRAY_KEY, String(open));
    } catch {
      // Private mode; the tray just won't remember.
    }
  }, []);

  // Trackpad swipes drag the track like a finger would, then settle on the nearest snap.
  const [viewportRef, embla] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", skipSnaps: false }, [
    WheelGesturesPlugin(),
  ]);
  const [snaps, setSnaps] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    if (!embla) return;
    const sync = () => {
      setSnaps(embla.scrollSnapList());
      setIndex(embla.selectedScrollSnap());
      setCanPrev(embla.canScrollPrev());
      setCanNext(embla.canScrollNext());
    };
    sync();
    embla.on("select", sync).on("reInit", sync);
    return () => {
      embla.off("select", sync).off("reInit", sync);
    };
  }, [embla]);

  // Slides change size when the tray opens; re-measure after the layout settles.
  useEffect(() => {
    const t = window.setTimeout(() => embla?.reInit(), 288);
    return () => window.clearTimeout(t);
  }, [embla, trayOpen, active.length, completed.length]);

  function onKey(e: KeyboardEvent) {
    if (e.target !== e.currentTarget || !embla) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      embla.scrollNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      embla.scrollPrev();
    }
  }

  function achieve(goal: Goal) {
    setTrayOpen(true);
    toggle.mutate({ item: goal, completed: true });
  }

  return (
    <section className={styles.goals} aria-label="Goals">
      <div className={styles.head}>
        <span className={styles.label}>Goals</span>
        <MagneticPlus onClick={(el) => openCreate("goal", originOf(el))} />
      </div>
      <div className={styles.gallery}>
        <button
          className={`${styles.arrow} ${styles.prev}`}
          aria-label="Previous goals"
          disabled={!canPrev}
          onClick={() => embla?.scrollPrev()}
        >
          <ChevronIcon dir="left" />
        </button>
        <div
          ref={viewportRef}
          className={styles.viewport}
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label="Goals. Use the arrow keys to move between them."
          onKeyDown={onKey}
        >
          <LayoutGroup id="goals">
            <div className={styles.track}>
              {active.length === 0 && (
                <div className={styles.slide} role="group" aria-roledescription="slide" aria-label="No goals yet">
                  <GhostCard onOpen={(el) => openCreate("goal", originOf(el))} />
                </div>
              )}
              {active.map((g, i) => (
                <div
                  key={keyOf(g.id)}
                  className={styles.slide}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${active.length}: ${g.title}`}
                >
                  <GoalCard goal={g} onAchieve={achieve} />
                </div>
              ))}
              <div className={`${styles.slide} ${styles.traySlide}`}>
                <AchievedTray goals={completed} open={trayOpen} onToggleOpen={() => setTrayOpen(!trayOpen)} />
              </div>
            </div>
          </LayoutGroup>
        </div>
        <button
          className={`${styles.arrow} ${styles.next}`}
          aria-label="Next goals"
          disabled={!canNext}
          onClick={() => embla?.scrollNext()}
        >
          <ChevronIcon dir="right" />
        </button>
      </div>
      {snaps.length > 1 && (
        <div className={styles.dots} aria-label="Goal pages">
          {snaps.map((_, i) => (
            <button
              key={i}
              className={styles.dot}
              aria-label={`Go to page ${i + 1}`}
              aria-current={i === index}
              onClick={() => embla?.scrollTo(i)}
            >
              {i === index ? (
                <motion.span layoutId="goal-dot" className={styles.pill} transition={spring.snappy} />
              ) : (
                <DotIcon seed={String(i)} />
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** The + drifts up to 6px toward a nearby cursor and turns a quarter on hover. */
function MagneticPlus({ onClick }: { onClick: (el: HTMLElement) => void }) {
  const x = useSpring(useMotionValue(0), spring.snappy);
  const y = useSpring(useMotionValue(0), spring.snappy);
  function move(e: PointerEvent<HTMLSpanElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > 48) return reset();
    x.set((dx / 48) * 6);
    y.set((dy / 48) * 6);
  }
  function reset() {
    x.set(0);
    y.set(0);
  }
  return (
    <span className={styles.magnet} onPointerMove={move} onPointerLeave={reset}>
      <motion.button
        className={styles.plus}
        style={{ x, y }}
        whileHover={{ rotate: 90 }}
        whileTap={{ scale: 0.85 }}
        transition={spring.snappy}
        aria-label="Add goal"
        aria-keyshortcuts="G"
        onClick={(e) => onClick(e.currentTarget)}
      >
        <PlusIcon />
      </motion.button>
    </span>
  );
}

function AchievedTray({ goals, open, onToggleOpen }: { goals: Goal[]; open: boolean; onToggleOpen: () => void }) {
  const toggle = useToggleComplete();
  return (
    <div className={styles.tray}>
      <button className={styles.trayToggle} aria-expanded={open} aria-controls="achieved-list" onClick={onToggleOpen}>
        <ChevronIcon dir="down" className={styles.chev} />
        <Roll value={goals.length} /> achieved
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            id="achieved-list"
            className={styles.achieved}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.smooth}
          >
            {goals.map((g) => (
              <motion.li
                key={keyOf(g.id)}
                layoutId={`goal-${keyOf(g.id)}`}
                className={styles.achievedItem}
                transition={spring.smooth}
                style={{ color: `var(--goal-${g.color})` }}
              >
                <Checkbox
                  shape="ring"
                  seed={keyOf(g.id)}
                  checked
                  burst={false}
                  label={`Reopen ${g.title}`}
                  className={styles.smallCb}
                  onChange={(checked) => !checked && toggle.mutate({ item: g, completed: false })}
                />
                <span>{g.title}</span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
