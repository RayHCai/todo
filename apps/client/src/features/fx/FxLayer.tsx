import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ellipse, rng, tick, wob } from "../../sketch/paths";
import { reducedMotion } from "../../motion/tokens";
import { onFx, type FxEvent } from "./fx";
import styles from "./FxLayer.module.css";

interface Live {
  id: number;
  event: FxEvent;
}

let nextId = 0;
const LIFETIME = { tick: 990, goal: 1350, ripple: 855 } as const;

/**
 * Full-page moments behind the board: a large marker tick when a todo is done, a frame around
 * the whole viewport plus a color wash when a goal is achieved, and rings where something new lands.
 */
export function FxLayer() {
  const [live, setLive] = useState<Live[]>([]);

  useEffect(
    () =>
      onFx((event) => {
        // Checked per event: the preference can change while the app is open.
        if (reducedMotion()) return;
        const id = ++nextId;
        setLive((l) => [...l.slice(-5), { id, event }]);
        window.setTimeout(() => setLive((l) => l.filter((x) => x.id !== id)), LIFETIME[event.kind]);
      }),
    [],
  );

  return (
    <div className={styles.layer} aria-hidden="true">
      <AnimatePresence>
        {live.map(({ id, event }) => (
          <Effect key={id} id={id} event={event} />
        ))}
      </AnimatePresence>
    </div>
  );
}

const draw = (duration: number, delay = 0) => ({
  initial: { pathLength: 0 },
  animate: { pathLength: 1 },
  transition: { duration, delay, ease: "easeOut" as const },
});

function Effect({ id, event }: { id: number; event: FxEvent }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = rng(`fx-${id}`);
  const fadeOut = { opacity: [1, 1, 0], transition: { duration: LIFETIME[event.kind] / 1000, times: [0, 0.5, 1] } };

  if (event.kind === "tick") {
    const s = Math.min(vw, vh) * 0.46;
    return (
      <motion.svg
        className={styles.svg}
        viewBox="0 0 16 16"
        style={{
          width: s,
          height: s,
          left: (vw - s) / 2,
          top: (vh - s) / 2,
          strokeWidth: (3.5 * 16) / s,
          strokeOpacity: 0.1,
        }}
        animate={fadeOut}
      >
        <motion.path d={tick(r)} {...draw(0.45)} />
      </motion.svg>
    );
  }

  if (event.kind === "goal") {
    const m = 16;
    const frame = wob(
      [
        [m, m],
        [vw - m, m],
        [vw - m, vh - m],
        [m, vh - m],
        [m, m - 6],
      ],
      r,
      3,
    );
    const size = Math.hypot(vw, vh) * 1.1;
    return (
      <motion.div className={styles.full} animate={fadeOut}>
        <motion.div
          className={styles.wash}
          style={{
            left: event.x - size / 2,
            top: event.y - size / 2,
            width: size,
            height: size,
            background: event.color,
          }}
          initial={{ scale: 0, opacity: 0.18 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 0.99, ease: [0.2, 0.7, 0.2, 1] }}
        />
        <svg
          className={styles.svg}
          viewBox={`0 0 ${vw} ${vh}`}
          style={{ inset: 0, width: "100%", height: "100%", color: event.color, strokeWidth: 3, strokeOpacity: 0.55 }}
        >
          <motion.path d={frame} {...draw(0.81)} />
        </svg>
      </motion.div>
    );
  }

  const s = Math.min(vw, vh) * 0.55;
  return (
    <motion.svg
      className={styles.svg}
      viewBox="0 0 100 100"
      style={{
        width: s,
        height: s,
        left: event.x - s / 2,
        top: event.y - s / 2,
        strokeWidth: 200 / s,
        strokeOpacity: 0.14,
      }}
      initial={{ scale: 0.15 }}
      animate={{ scale: 1, ...fadeOut }}
      transition={{ duration: 0.855, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <motion.path d={ellipse(50, 50, 44, 44, r, { a: 1.2, n: 18 })} {...draw(0.54)} />
      <motion.path d={ellipse(50, 50, 29, 29, r, { a: 1, n: 14 })} {...draw(0.45, 0.072)} />
    </motion.svg>
  );
}
