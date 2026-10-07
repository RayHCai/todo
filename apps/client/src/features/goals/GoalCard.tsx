import type { Goal } from "@todo/shared";
import { motion, useAnimate } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { keyOf } from "../../lib/keys";
import { monthShort } from "../../lib/dates";
import { spring } from "../../motion/tokens";
import { Checkbox } from "../../sketch/Checkbox";
import { rng, tick } from "../../sketch/paths";
import { Frame } from "../../sketch/Sketch";
import { originOf, useUi } from "../../store/ui";
import { centerOf, emitFx } from "../fx/fx";
import styles from "./GoalCard.module.css";

/** How long the card shows its "Achieved" back face before flying to the tray. */
const HOLD_MS = 700;

export function GoalCard({ goal, onAchieve }: { goal: Goal; onAchieve: (goal: Goal) => void }) {
  const key = keyOf(goal.id);
  const openEdit = useUi((s) => s.openEdit);
  const landed = useUi((s) => s.landed[key]);
  const shaken = useUi((s) => s.shaken[key]);
  const [checked, setChecked] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [scope, animate] = useAnimate<HTMLElement>();
  const timer = useRef<number>(undefined);
  const color = `var(--goal-${goal.color})`;

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!shaken || !scope.current) return;
    setChecked(false);
    setFlipped(false);
    void animate(scope.current, { x: [0, -8, 7, -4, 2, 0] }, { duration: 0.36 });
  }, [shaken, animate, scope]);

  function check(next: boolean) {
    setChecked(next);
    if (!next) {
      window.clearTimeout(timer.current);
      setFlipped(false);
      return;
    }
    const resolved = getComputedStyle(scope.current ?? document.body)
      .getPropertyValue(`--goal-${goal.color}`)
      .trim();
    emitFx({ kind: "goal", color: resolved || "currentColor", ...centerOf(scope.current) });
    window.setTimeout(() => setFlipped(true), 198);
    timer.current = window.setTimeout(() => onAchieve(goal), HOLD_MS);
  }

  return (
    <motion.article
      ref={scope}
      layoutId={`goal-${key}`}
      data-key={key}
      className={`${styles.card} ${landed ? styles.landed : ""}`}
      style={{ color }}
      transition={spring.smooth}
      initial={landed ? { opacity: 0, y: -10, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -2 }}
    >
      <motion.div className={styles.inner} animate={{ rotateY: flipped ? 180 : 0 }} transition={spring.smooth}>
        <div className={styles.front} aria-hidden={flipped}>
          <Frame seed={key} className={styles.frame} />
          <button
            className={styles.title}
            onClick={(e) => openEdit("goal", goal.id, originOf(e.currentTarget.closest("article")))}
          >
            {goal.title}
          </button>
          {goal.description && <p className={styles.desc}>{goal.description}</p>}
          <div className={styles.foot}>
            <Checkbox
              shape="ring"
              seed={key}
              checked={checked}
              label={`Mark ${goal.title} achieved`}
              onChange={check}
              color={color}
            />
            {goal.carriedOver && <span className={styles.tag}>from {monthShort(goal.month)}</span>}
          </div>
        </div>
        <div className={styles.back} aria-hidden={!flipped}>
          <Frame seed={`${key}-back`} className={styles.frame} />
          <AchievedMark draw={flipped} />
          <span className={styles.achieved}>Achieved</span>
        </div>
      </motion.div>
    </motion.article>
  );
}

function AchievedMark({ draw }: { draw: boolean }) {
  const d = useMemo(() => tick(rng("achieved"), 1), []);
  return (
    <svg className={`sk ${styles.mark}`} viewBox="0 0 16 16" aria-hidden="true">
      <motion.path
        d={d}
        initial={false}
        animate={{ pathLength: draw ? 1 : 0 }}
        transition={{ duration: 0.315, delay: draw ? 0.225 : 0 }}
      />
    </svg>
  );
}

export function GhostCard({ onOpen }: { onOpen: (el: HTMLElement) => void }) {
  return (
    <button className={`${styles.card} ${styles.ghost}`} onClick={(e) => onOpen(e.currentTarget)}>
      <Frame seed="ghost" className={styles.frame} />
      <span className={styles.ghostText}>What do you want to make true this month?</span>
    </button>
  );
}
